const socket = io();
let myId;

socket.on("connect", () => (myId = socket.id));

socket.on("startRound", (data) => {
  document.getElementById("actions").style.display = "none";
  document.getElementById("last-bet").innerText = "";
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
  document.getElementById(
    "last-bet"
  ).innerText = `이전 베팅: ${data.lastBet}칩`;
});

socket.on("yourTurn", (data) => {
  document.getElementById("actions").style.display = "block";
  document.getElementById(
    "last-bet"
  ).innerText = `이전 베팅: ${data.lastBet}칩`;
  document.getElementById("message").innerText = data.required
    ? `🎯 당신의 턴! 최소 ${data.required}칩 배팅하세요.`
    : "🎯 당신의 턴! 배팅하세요.";
});

socket.on("roundResult", (data) => {
  alert(
    data.tie
      ? "무승부! 팟 이월됩니다."
      : data.winner === myId
      ? `🎉 이겼습니다! ${data.pot}칩 획득`
      : "😢 졌습니다!"
  );
  document.getElementById("actions").style.display = "none";
});

socket.on("gameOver", (data) =>
  alert(data.winner === myId ? "🏆 승리!" : "💀 패배...")
);

socket.on(
  "message",
  (msg) => (document.getElementById("message").innerText = msg)
);

socket.on("chatMessage", (data) => {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${data.sender === myId ? "You" : "Opp"}:</strong> ${
    data.message
  }`;
  const c = document.getElementById("chat-messages");
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
});

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("bet-btn").onclick = () => {
    const amt = +document.getElementById("bet-amount").value;
    socket.emit("bet", amt);
    document.getElementById("actions").style.display = "none";
  };
  document.getElementById("fold-btn").onclick = () => {
    socket.emit("fold");
    document.getElementById("actions").style.display = "none";
  };
  document.getElementById("chat-send").onclick = () => {
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (msg) {
      socket.emit("chatMessage", msg);
      input.value = "";
    }
  };
});
