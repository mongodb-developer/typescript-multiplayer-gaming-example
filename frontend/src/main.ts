import "./style.css";
import Phaser from "phaser";
import { initLobby } from "./screens/lobby";
import { renderResults } from "./screens/results";
import { GameScene, type GameSceneData } from "./game/game-scene";
import type { GameEndPayload, GameStartPayload } from "./types";

const lobbyScreen = document.getElementById("lobby")!;
const gameScreen = document.getElementById("game-screen")!;
const resultsScreen = document.getElementById("results")!;
const gameContainer = document.getElementById("game-container")!;

/**
 * Shows one of the three top-level screens (lobby, game, results) and hides the
 * other two.
 */
function showScreen(screen: HTMLElement): void {
    for (const el of [lobbyScreen, gameScreen, resultsScreen]) {
        el.classList.toggle("hidden", el !== screen);
    }
}

let activeGame: Phaser.Game | null = null;

/**
 * Runs when the server says both players are in and the match is starting.
 * Swaps to the game screen and boots a Phaser game sized from the server's
 * canvas dimensions, handing `GameScene` the room ID, this client's slot, and
 * the start payload.
 */
function handleMatchReady(
    roomId: string,
    mySlot: 1 | 2,
    startPayload: GameStartPayload
): void {
    showScreen(gameScreen);

    activeGame = new Phaser.Game({
        type: Phaser.AUTO,
        parent: gameContainer,
        width: startPayload.canvasWidth,
        height: startPayload.canvasHeight,
        backgroundColor: "#14151c",
        scale: {
            mode: Phaser.Scale.NONE,
        },
        physics: {
            default: "arcade",
            arcade: {
                gravity: { x: 0, y: 0 },
            },
        },
        scene: [GameScene],
    });

    const sceneData: GameSceneData = {
        roomId,
        mySlot,
        startPayload,
        onEnd: handleGameEnd,
    };
    activeGame.scene.start("GameScene", sceneData);
}

/**
 * Tears down the Phaser game when the match ends and shows the final scores.
 * The results screen's "play again" resets the lobby, refreshes the leaderboard,
 * and returns to it, where a brand new match has to be created — matches are
 * never reused.
 */
function handleGameEnd(result: GameEndPayload): void {
    if (activeGame) {
        activeGame.destroy(true);
        activeGame = null;
    }
    showScreen(resultsScreen);
    renderResults(result, () => {
        returnToLobby();
        showScreen(lobbyScreen);
    });
}

const returnToLobby = initLobby(handleMatchReady);
