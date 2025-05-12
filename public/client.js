const socket = io();
let myId;

socket.on("connect", () => (myId = socket.id));

socket.on("startRound", (data) => {
  const oppIndex = data.players.findIndex((p) => p.id !== myId);
  document.getElementById("opp-card").innerText = data.opponentHands[oppIndex];
  document.getElementById("my-chips").innerText = data.players.find(
    (p) => p.id === myId
  ).chips;
  document.getElementById("pot").innerText = data.pot;
});

socket.on("update", (data) => {
  document.getElementById("my-chips").innerText = data.players.find(
    (p) => p.id === myId
  ).chips;
  document.getElementById("pot").innerText = data.pot;
});

socket.on("yourTurn", () => {
  document.getElementById("actions").style.display = "block";
});

socket.on("roundResult", (data) => {
  if (data.tie) alert("무승부! 팟 이월.");
  else if (data.winner === myId) alert(`이겼습니다! ${data.pot} 칩 획득`);
  else alert("졌습니다!");
  document.getElementById("actions").style.display = "none";
});

socket.on("gameOver", (data) => {
  if (data.winner === myId) alert("게임 승리!");
  else alert("게임 패배...");
});

// 버튼 이벤트
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("bet-btn").addEventListener("click", () => {
    const amt = parseInt(document.getElementById("bet-amount").value, 10);
    socket.emit("bet", amt);
  });
  document.getElementById("fold-btn").addEventListener("click", () => {
    socket.emit("fold");
  });
});
