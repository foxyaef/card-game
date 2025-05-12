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
  socket.on("chat", (msg) => {
    const room = Object.values(rooms).find((r) =>
      r.players.some((p) => p.id === socket.id)
    );
    if (room) {
      io.to(room.id).emit("chat", msg);
    }
  });
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

  room.players.forEach((p) => {
    p.hand = room.deck.pop();
    p.chips -= 1;
    room.pot += 1;
  });

  // 💡 항상 방장이 선턴
  room.currentTurn = 0;
  room.bets = {
    [room.players[0].id]: 0,
    [room.players[1].id]: 0,
  };
  room.lastBetter = room.players[0].id;

  // 💡 모든 유저에게 전체 opponentHands 배열 전송 (클라에서 상대만 골라서 사용)
  io.to(roomId).emit("startRound", {
    opponentHands: room.players.map((p) => p.hand),
    players: room.players.map((p) => ({ id: p.id, chips: p.chips })),
    pot: room.pot,
    startPlayer: room.players[0].id,
  });

  io.to(room.players[0].id).emit("yourTurn");
}

function handleBet(roomId, playerId, amount) {
  const room = rooms[roomId];
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx !== room.currentTurn) {
    io.to(playerId).emit(
      "message",
      "지금은 당신의 턴이 아닙니다. 기다려주세요"
    );
    return;
  }

  const player = room.players[idx];
  const opponent = room.players[1 - idx];
  const callAmt = room.bets[opponent.id] - room.bets[player.id];

  if (amount < callAmt) {
    io.to(playerId).emit("message", `최소 ${callAmt}칩 이상 베팅해야 합니다.`);

    io.to(playerId).emit("yourTurn", {
      opponentBet: room.bets[opponent.id],
    });

    return;
  }

  if (player.chips < amount) {
    io.to(playerId).emit("message", "보유 칩보다 많이 걸 수 없습니다.");
    io.to(playerId).emit("yourTurn", {
      opponentBet: room.bets[opponent.id],
    });
    return;
  }

  player.chips -= amount;
  room.bets[playerId] += amount;
  room.pot += amount;

  io.to(roomId).emit("update", {
    players: room.players.map((p) => ({ id: p.id, chips: p.chips })),
    pot: room.pot,
    bets: { ...room.bets },
  });

  const p1 = room.players[0];
  const p2 = room.players[1];
  const p1Bet = room.bets[p1.id];
  const p2Bet = room.bets[p2.id];

  // ✅ 두 사람 베팅액이 같고, 베팅이 최소 1 이상이면 정산
  const equalAndBothBet = p1Bet === p2Bet && p1Bet > 0;

  if (equalAndBothBet) {
    return resolveRound(roomId);
  }

  room.lastBetter = playerId;
  room.currentTurn = 1 - room.currentTurn;
  // 💡 턴 넘기면서 상대가 낸 칩 개수 전달
  const opponentId = room.players[1 - room.currentTurn].id;
  const opponentBet = room.bets[opponentId];

  io.to(room.players[room.currentTurn].id).emit("yourTurn", {
    opponentBet: room.bets[room.players[1 - room.currentTurn].id],
  });
}

function handleFold(roomId, playerId) {
  const room = rooms[roomId];
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx !== room.currentTurn) {
    io.to(playerId).emit("message", "지금은 당신의 턴이 아닙니다.");
    return;
  }
  const player = room.players[idx];
  const opponent = room.players[1 - idx];
  if (player.hand === 10) {
    const penalty = Math.min(10, player.chips);
    player.chips -= penalty;
    room.pot += penalty;
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
  if (room.players.every((p) => p.chips > 0)) {
    startGame(roomId);
  }
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
