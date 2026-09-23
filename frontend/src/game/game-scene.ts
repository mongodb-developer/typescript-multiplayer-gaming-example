import Phaser from "phaser";
import type { GameEndPayload, GameStartPayload, MoveDirection, Scores } from "../types";
import { removeAllGameListeners, socket } from "../socket";

const MOVE_EMIT_INTERVAL_MS = 60;
const LOCAL_OUTLINE_COLOR = 0x4c6ef5;

/** Everything `GameScene` needs to run a match, passed in via `scene.start`. */
export interface GameSceneData {
    roomId: string;
    mySlot: 1 | 2;
    startPayload: GameStartPayload;
    onEnd: (result: GameEndPayload) => void;
}

type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
type CoinSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

/**
 * The Phaser scene for a single match.
 *
 * Deliberately thin: it renders what the server tells it and forwards input. Key
 * presses become `player:move` emits, and sprites only move when `player:moved`
 * comes back; coins appear and disappear on `coin:spawned` / `coin:collected`;
 * scores come from the server. The one piece of local logic is overlap
 * detection, which just raises a `coin:collect` claim for the server to validate.
 */
export class GameScene extends Phaser.Scene {
    private sceneData!: GameSceneData;
    private player1!: PlayerSprite;
    private player2!: PlayerSprite;
    private localPlayer!: PlayerSprite;
    private coinSprites = new Map<string, CoinSprite>();
    private coinsGroup!: Phaser.Physics.Arcade.Group;
    private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
    private moveAccumulator = 0;
    private matchEndAt = 0;

    /** Registers the scene under the key `"GameScene"`. */
    constructor() {
        super("GameScene");
    }

    /**
     * Phaser lifecycle hook: stores the match data and resets per-match state so
     * nothing carries over if the scene is reused.
     */
    init(data: GameSceneData): void {
        this.sceneData = data;
        this.coinSprites.clear();
        this.moveAccumulator = 0;
    }

    /**
     * Phaser lifecycle hook: builds the match. Generates the square textures,
     * places both player sprites (the local one gets an outline), creates the
     * coin group and the local overlap check, binds arrow keys and WASD, and
     * subscribes to the server's in-match events.
     */
    create(): void {
        const { startPayload, mySlot } = this.sceneData;
        const { playerSize, coinSize, canvasWidth, canvasHeight, durationMs } = startPayload;

        this.matchEndAt = Date.now() + durationMs;

        this.generateTextures(playerSize, coinSize);

        const p1Start = this.getStartingPosition(1, canvasWidth, canvasHeight, playerSize);
        const p2Start = this.getStartingPosition(2, canvasWidth, canvasHeight, playerSize);

        this.player1 = this.physics.add.sprite(
            p1Start.x,
            p1Start.y,
            mySlot === 1 ? "player-outline" : "player"
        );
        this.player1.setOrigin(0, 0);
        this.player1.body.setAllowGravity(false);
        this.player1.body.setImmovable(true);

        this.player2 = this.physics.add.sprite(
            p2Start.x,
            p2Start.y,
            mySlot === 2 ? "player-outline" : "player"
        );
        this.player2.setOrigin(0, 0);
        this.player2.body.setAllowGravity(false);
        this.player2.body.setImmovable(true);

        this.localPlayer = mySlot === 1 ? this.player1 : this.player2;

        this.coinsGroup = this.physics.add.group();

        this.physics.add.overlap(
            this.localPlayer,
            this.coinsGroup,
            (_player, coin) => this.handleCoinOverlap(coin as CoinSprite),
            undefined,
            this
        );

        const keyboard = this.input.keyboard;
        if (!keyboard) throw new Error("Keyboard input not available");
        this.cursorKeys = keyboard.createCursorKeys();
        this.wasdKeys = keyboard.addKeys("W,A,S,D") as typeof this.wasdKeys;

        socket.on("player:moved", ({ username, x, y }) => {
            const sprite = this.spriteForUsername(username);
            sprite?.setPosition(x, y);
        });

        socket.on("coin:spawned", (coin) => {
            if (this.coinSprites.has(coin.id)) return;
            const sprite = this.physics.add.sprite(coin.x, coin.y, "coin");
            sprite.setOrigin(0, 0);
            sprite.body.setAllowGravity(false);
            sprite.setData("id", coin.id);
            this.coinsGroup.add(sprite);
            this.coinSprites.set(coin.id, sprite);
        });

        socket.on("coin:collected", ({ coinId, scores }) => {
            this.removeCoinSprite(coinId);
            this.updateHud(scores);
        });

        socket.on("game:end", (result) => {
            removeAllGameListeners();
            this.sceneData.onEnd(result);
        });

        this.updateHud({
            player1: { username: startPayload.players.player1, score: 0 },
            player2: { username: startPayload.players.player2, score: 0 },
        });
    }

    /**
     * Phaser lifecycle hook, run every frame: refreshes the countdown, then — at
     * most once per `MOVE_EMIT_INTERVAL_MS`, to avoid flooding the server — reads
     * the held movement keys and emits one `player:move` per active axis.
     * Opposing keys on the same axis cancel out.
     */
    update(_time: number, delta: number): void {
        this.updateTimerHud();

        this.moveAccumulator += delta;
        if (this.moveAccumulator < MOVE_EMIT_INTERVAL_MS) return;
        this.moveAccumulator = 0;

        const up = this.cursorKeys.up.isDown || this.wasdKeys.W.isDown;
        const down = this.cursorKeys.down.isDown || this.wasdKeys.S.isDown;
        const left = this.cursorKeys.left.isDown || this.wasdKeys.A.isDown;
        const right = this.cursorKeys.right.isDown || this.wasdKeys.D.isDown;

        const directions: MoveDirection[] = [];
        if (up && !down) directions.push("up");
        if (down && !up) directions.push("down");
        if (left && !right) directions.push("left");
        if (right && !left) directions.push("right");

        for (const direction of directions) {
            socket.emit("player:move", { roomId: this.sceneData.roomId, direction });
        }
    }

    /**
     * Called when the local player's sprite overlaps a coin. Sends a
     * `coin:collect` claim with the player's position for the server to verify,
     * and hides the coin locally so the same overlap is not reported repeatedly.
     * The score change arrives separately, from the server.
     */
    private handleCoinOverlap(coin: CoinSprite): void {
        const coinId = coin.getData("id") as string | undefined;
        if (!coinId || !this.coinSprites.has(coinId)) return;

        socket.emit("coin:collect", {
            roomId: this.sceneData.roomId,
            coinId,
            playerX: this.localPlayer.x,
            playerY: this.localPlayer.y,
        });
        this.removeCoinSprite(coinId);
    }

    /** Destroys a coin's sprite and drops it from the tracking map. No-op if unknown. */
    private removeCoinSprite(coinId: string): void {
        const sprite = this.coinSprites.get(coinId);
        if (!sprite) return;
        sprite.destroy();
        this.coinSprites.delete(coinId);
    }

    /**
     * Maps a username from a server broadcast onto the matching player sprite, or
     * `null` if the name belongs to neither player in this match.
     */
    private spriteForUsername(username: string): PlayerSprite | null {
        const { players } = this.sceneData.startPayload;
        if (username === players.player1) return this.player1;
        if (username === players.player2) return this.player2;
        return null;
    }

    /**
     * Where a slot's sprite is drawn before the first movement broadcast: player 1
     * on the left, player 2 on the right, both vertically centered. Mirrors
     * `getStartingPosition` in the backend's game state module.
     */
    private getStartingPosition(
        slot: 1 | 2,
        canvasWidth: number,
        canvasHeight: number,
        playerSize: number
    ): { x: number; y: number } {
        if (slot === 1) {
            return { x: playerSize * 2, y: Math.floor(canvasHeight / 2) };
        }
        return { x: canvasWidth - playerSize * 3, y: Math.floor(canvasHeight / 2) };
    }

    /**
     * Draws the three textures the game needs — a white player square, the same
     * square with a blue outline marking the local player, and a small yellow coin
     * square — at the sizes the server dictates. There are no image assets to
     * load. Each texture is only generated once.
     */
    private generateTextures(playerSize: number, coinSize: number): void {
        if (!this.textures.exists("player")) {
            const g = this.make.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, playerSize, playerSize);
            g.generateTexture("player", playerSize, playerSize);
            g.destroy();
        }

        if (!this.textures.exists("player-outline")) {
            const g = this.make.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, playerSize, playerSize);
            g.lineStyle(4, LOCAL_OUTLINE_COLOR, 1);
            g.strokeRect(2, 2, playerSize - 4, playerSize - 4);
            g.generateTexture("player-outline", playerSize, playerSize);
            g.destroy();
        }

        if (!this.textures.exists("coin")) {
            const g = this.make.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffd43b, 1);
            g.fillRect(0, 0, coinSize, coinSize);
            g.generateTexture("coin", coinSize, coinSize);
            g.destroy();
        }
    }

    /** Writes both players' names and scores into the HUD elements outside the canvas. */
    private updateHud(scores: Scores): void {
        const p1El = document.getElementById("hud-player1");
        const p2El = document.getElementById("hud-player2");
        if (p1El) p1El.textContent = `${scores.player1.username}: ${scores.player1.score}`;
        if (p2El) p2El.textContent = `${scores.player2.username}: ${scores.player2.score}`;
    }

    /**
     * Renders the seconds left in the HUD countdown. Cosmetic only — the server's
     * timer is what actually ends the match.
     */
    private updateTimerHud(): void {
        const timerEl = document.getElementById("hud-timer");
        if (!timerEl) return;
        const remainingMs = Math.max(0, this.matchEndAt - Date.now());
        timerEl.textContent = `${Math.ceil(remainingMs / 1000)}s`;
    }
}
