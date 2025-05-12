const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function createDeck() {
  const deck = [];
  for (let num = 1; num <= 10; num++) {
    deck.push(num, num);
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

const rooms = {};

io.on("connection", (socket) => {
  // 방 찾기 또는 생성
  let room = Object.values(rooms).find((r) => r.players.length === 1);
  if (!room) {
    room = {
      id: socket.id,
      players: [],
      deck: [],
      pot: 0,
      bets: {},
      state: "waiting",
    };
    rooms[room.id] = room;
  }
  room.players.push({ id: socket.id, chips: 30, hand: null });
  socket.join(room.id);

  if (room.players.length === 2) startGame(room.id);

  socket.on("bet", (amount) => handleBet(room.id, socket.id, amount));
  socket.on("fold", () => handleFold(room.id, socket.id));
  socket.on("disconnect", () => {
    delete rooms[room.id];
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  room.deck = createDeck();
  shuffle(room.deck);
  room.pot = 0;
  room.state = "round";

  // 한 장씩 배분 + 앤티
  room.players.forEach((p) => {
    p.hand = room.deck.pop();
    p.chips -= 1;
    room.pot += 1;
  });
  room.currentTurn = 0; // 선 플레이어부터
  room.bets = { [room.players[0].id]: 0, [room.players[1].id]: 0 };

  io.to(roomId).emit("startRound", {
    opponentHands: room.players.map((p) => p.hand),
    players: room.players.map((p) => ({ id: p.id, chips: p.chips })),
    pot: room.pot,
  });
  // 첫 턴 알림
  io.to(room.players[room.currentTurn].id).emit("yourTurn");
}

function handleBet(roomId, playerId, amount) {
  const room = rooms[roomId];
  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  // 턴제 확인
  if (playerIndex !== room.currentTurn) {
    io.to(playerId).emit("message", "지금은 당신의 턴이 아닙니다.");
    return;
  }
  const player = room.players[playerIndex];
  const opponent = room.players[1 - playerIndex];
  const callAmt = room.bets[opponent.id] - room.bets[playerId] || 0;
  if (amount < callAmt) {
    io.to(playerId).emit("message", `최소 ${callAmt}칩 이상 베팅해야 합니다.`);
    return;
  }

  player.chips -= amount;
  room.bets[playerId] += amount;
  room.pot += amount;

  if (room.bets[playerId] === room.bets[opponent.id]) {
    // 베팅 종료
    resolveRound(roomId);
  } else {
    // 턴 넘기기
    room.currentTurn = 1 - room.currentTurn;
    io.to(roomId).emit("update", {
      players: room.players.map((p) => ({ id: p.id, chips: p.chips })),
      pot: room.pot,
    });
    io.to(room.players[room.currentTurn].id).emit("yourTurn");
  }
}

function handleFold(roomId, playerId) {
  const room = rooms[roomId];
  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  // 턴제 확인
  if (playerIndex !== room.currentTurn) {
    io.to(playerId).emit("message", "지금은 당신의 턴이 아닙니다.");
    return;
  }
  const player = room.players[playerIndex];
  const opponent = room.players[1 - playerIndex];

  // 10 패널티 처리
  if (player.hand === 10) {
    player.chips -= 10;
    room.pot += 10;
  }
  opponent.chips += room.pot;
  io.to(roomId).emit("roundResult", { winner: opponent.id, pot: room.pot });
  checkGameOver(roomId) || nextRound(roomId);
}

function resolveRound(roomId) {
  const room = rooms[roomId];
  const [p1, p2] = room.players;
  if (p1.hand === p2.hand) {
    io.to(roomId).emit("roundResult", { tie: true, pot: room.pot });
    return nextRound(roomId);
  }
  const winner = p1.hand > p2.hand ? p1 : p2;
  winner.chips += room.pot;
  io.to(roomId).emit("roundResult", { winner: winner.id, pot: room.pot });
  checkGameOver(roomId) || nextRound(roomId);
}

function nextRound(roomId) {
  const room = rooms[roomId];
  // 잔여 칩 확인 후 게임 계속 또는 종료
  if (room.players.every((p) => p.chips > 0)) startGame(roomId);
  else checkGameOver(roomId);
}

function checkGameOver(roomId) {
  const room = rooms[roomId];
  const loser = room.players.find((p) => p.chips <= 0);
  if (loser) {
    const winner = room.players.find((p) => p.chips > 0);
    io.to(roomId).emit("gameOver", { winner: winner.id });
    delete rooms[roomId];
    return true;
  }
  return false;
}

server.listen(PORT, () => console.log(`Listening on ${PORT}`));
