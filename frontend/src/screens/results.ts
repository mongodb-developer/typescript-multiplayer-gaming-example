import type { GameEndPayload } from "../types";

/**
 * Fills in the results screen with the winner (or a draw) and both final scores,
 * and points the "play again" button at the supplied callback.
 */
export function renderResults(result: GameEndPayload, onPlayAgain: () => void): void {
    const winnerEl = document.getElementById("results-winner")!;
    const scoresEl = document.getElementById("results-scores")!;
    const playAgainBtn = document.getElementById("play-again-btn") as HTMLButtonElement;

    const { player1, player2 } = result.scores;

    winnerEl.textContent = result.winner ? `${result.winner} wins!` : "It's a draw!";
    scoresEl.textContent = `${player1.username}: ${player1.score}  —  ${player2.username}: ${player2.score}`;

    playAgainBtn.onclick = () => onPlayAgain();
}
