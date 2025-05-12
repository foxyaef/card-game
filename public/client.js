const socket = io();
let myId;

socket.on("connect", () => (myId = socket.id));

socket.on("startRound", (data) => {
  document.getElementById("actions").style.display = "none";
  document.getElementById("message").innerText =
    data.startPlayer === myId ? "🚀 당신이 먼저 시작!" : "⏳ 상대가 먼저 시작";

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

socket.on("yourTurn", (data) => {
  document.getElementById("actions").style.display = "block";
  document.getElementById("message").innerText = "🎯 당신의 턴! 베팅하세요.";
  if (data?.opponentBet !== undefined) {
    document.getElementById(
      "message"
    ).innerText += ` (상대는 ${data.opponentBet}칩 냈습니다)`;
  }
});

socket.on("roundResult", (data) => {
  if (data.tie) alert("무승부! 팟 이월됩니다.");
  else if (data.winner === myId) alert(`🎉 이겼습니다! ${data.pot} 칩 획득`);
  else alert("😢 졌습니다!");
  document.getElementById("actions").style.display = "none";
});

socket.on("gameOver", (data) => {
  alert(data.winner === myId ? "🏆 게임 승리!" : "💀 게임 패배...");
});

socket.on("message", (msg) => {
  document.getElementById("message").innerText = msg;
});

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("bet-btn").addEventListener("click", () => {
    const amt = parseInt(document.getElementById("bet-amount").value, 10);
    socket.emit("bet", amt);
    document.getElementById("actions").style.display = "none";
  });
  document.getElementById("fold-btn").addEventListener("click", () => {
    socket.emit("fold");
    document.getElementById("actions").style.display = "none";
  });
});
document.getElementById("chat-send").addEventListener("click", () => {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (message !== "") {
    socket.emit("chat", message);
    input.value = "";
  }
});

socket.on("chat", (msg) => {
  const box = document.getElementById("chat-box");
  const line = document.createElement("div");
  line.innerText = msg;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
});
