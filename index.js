const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

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

io.on('connection', (socket) => {
// 방 찾기 또는 생성
let room = Object.values(rooms).find(r => r.players.length === 1);
if (!room) {
room = { id: socket.id, players: [], deck: [], pot: 0, bets: {}, state: 'waiting' };
rooms[room.id] = room;
}
room.players.push({ id: socket.id, chips: 30, hand: null });
socket.join(room.id);

if (room.players.length === 2) startGame(room.id);

socket.on('bet', (amount) => handleBet(room.id, socket.id, amount));
socket.on('fold', () => handleFold(room.id, socket.id));

socket.on('chatMessage', (msg) => {
io.to(room.id).emit('chatMessage', { sender: socket.id, message: msg });
});

socket.on('disconnect', () => {
delete rooms[room.id];
});
});

function startGame(roomId, carryPot = 0) {
const room = rooms[roomId];
room.deck = createDeck();
shuffle(room.deck);
room.pot = carryPot;
room.state = 'round';
room.bets = {};

room.players.forEach(p => {
p.hand = room.deck.pop();
p.chips -= 1;
room.pot += 1;
room.bets[p.id] = 0;
});

room.currentTurn = Math.floor(Math.random() * 2);
emitRoundStart(room);
}

function emitRoundStart(room) {
const roomId = this.id || Object.keys(rooms).find(id => rooms[id] === this) || arguments[0];
const roomObj = rooms[roomId] || this;
io.to(roomId).emit('startRound', {
opponentHands: roomObj.players.map(p => p.hand),
players: roomObj.players.map(p => ({ id: p.id, chips: p.chips })),
pot: roomObj.pot,
lastBet: 0,
required: 0,
startPlayer: roomObj.players[roomObj.currentTurn].id
});
io.to(roomObj.players[roomObj.currentTurn].id).emit('yourTurn', { lastBet: 0, required: 0 });
}

function handleBet(roomId, playerId, amount) {
const room = rooms[roomId];
const idx = room.players.findIndex(p => p.id === playerId);
if (idx !== room.currentTurn) {
io.to(playerId).emit('message', '지금은 당신의 턴이 아닙니다.');
io.to(playerId).emit('yourTurn', { lastBet: room.bets[room.players[1-idx].id], required: room.bets[room.players[1-idx].id] });
return;
}
const opponentId = room.players[1 - idx].id;
const lastBet = room.bets[opponentId];
if (amount < lastBet) {
io.to(playerId).emit('message', 최소 ${lastBet}칩 이상 베팅해야 합니다.);
io.to(playerId).emit('yourTurn', { lastBet, required: lastBet });
return;
}

room.bets[playerId] += amount;
room.players[idx].chips -= amount;
room.pot += amount;

if (room.bets[playerId] === room.bets[opponentId]) {
resolveRound(roomId);
} else {
room.currentTurn = 1 - room.currentTurn;
io.to(roomId).emit('update', {
players: room.players.map(p => ({ id: p.id, chips: p.chips })),
pot: room.pot,
lastBet: room.bets[playerId]
});
io.to(room.players[room.currentTurn].id)
.emit('yourTurn', { lastBet: room.bets[playerId], required: room.bets[playerId] });
}
}

function handleFold(roomId, playerId) {
const room = rooms[roomId];
const idx = room.players.findIndex(p => p.id === playerId);
if (idx !== room.currentTurn) {
io.to(playerId).emit('message', '지금은 당신의 턴이 아닙니다.');
io.to(playerId).emit('yourTurn', { lastBet: room.bets[room.players[1-idx].id], required: room.bets[room.players[1-idx].id] });
return;
}
const player = room.players[idx];
const opponent = room.players[1 - idx];
if (player.hand === 10) {
player.chips -= 10;
room.pot += 10;
}
opponent.chips += room.pot;
io.to(roomId).emit('roundResult', { winner: opponent.id, pot: room.pot });
checkGameOver(roomId) || nextRound(roomId);
}

function resolveRound(roomId) {
const room = rooms[roomId];
const [p1, p2] = room.players;
if (p1.hand === p2.hand) {
io.to(roomId).emit('roundResult', { tie: true, pot: room.pot });
return nextRound(roomId);
}
const winner = p1.hand > p2.hand ? p1 : p2;
winner.chips += room.pot;
io.to(roomId).emit('roundResult', { winner: winner.id, pot: room.pot });
checkGameOver(roomId) || nextRound(roomId);
}

function nextRound(roomId) {
const room = rooms[roomId];
if (room.players.every(p => p.chips > 0)) startGame(roomId, room.pot);
else checkGameOver(roomId);
}

function checkGameOver(roomId) {
const room = rooms[roomId];
const loser = room.players.find(p => p.chips <= 0);
if (loser) {
const winner = room.players.find(p => p.chips > 0);
io.to(roomId).emit('gameOver', { winner: winner.id });
delete rooms[roomId];
return true;
}
return false;
}

server.listen(PORT, () => console.log(Listening on ${PORT}));