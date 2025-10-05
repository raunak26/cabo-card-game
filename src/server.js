// server.js - Full WebSocket server for Cabo card game
// Install: npm install ws
// Run: node server.js

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// Global game storage on the SERVER
const games = new Map();

// Track all connected clients and which game they're in
const clients = new Map(); // Map<WebSocket, { playerId, gameCode }>

function broadcast(gameCode, message, excludeClient = null) {
  const messageStr = JSON.stringify(message);
  clients.forEach((clientInfo, client) => {
    if (clientInfo.gameCode === gameCode && client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];

  suits.forEach(suit => {
    values.forEach(value => {
      deck.push({ suit, value });
    });
  });

  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function calculateScore(cards) {
  let total = 0;
  cards.forEach(card => {
    switch (card.value) {
      case 'A': total += 1; break;
      case 'J': total += 11; break;
      case 'Q': total += 12; break;
      case 'K': 
        total += (card.suit === '♥' || card.suit === '♦') ? -1 : 13;
        break;
      default: total += parseInt(card.value);
    }
  });
  return total;
}

function nextTurn(game) {
  game.currentTurn = (game.currentTurn + 1) % game.players.length;
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('Received:', message.type);

      switch (message.type) {
        case 'CREATE_GAME': {
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          const game = {
            code,
            host: message.playerId,
            players: [{
              id: message.playerId,
              name: message.playerName,
              isHost: true,
              cards: [],
              score: 0,
              canSeeCorners: false
            }],
            state: 'lobby',
            currentTurn: 0,
            deck: [],
            discardPile: [],
            round: 1,
            drawnCard: null,
            currentPlayerId: null,
            caboCallerId: null,
            turnsAfterCabo: 0
          };

          games.set(code, game);
          clients.set(ws, { playerId: message.playerId, gameCode: code });

          ws.send(JSON.stringify({
            type: 'GAME_CREATED',
            gameCode: code,
            game
          }));
          break;
        }

        case 'JOIN_GAME': {
          const game = games.get(message.gameCode);
          
          if (!game) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Game not found'
            }));
            break;
          }

          if (game.players.length >= 8) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Game is full'
            }));
            break;
          }

          if (game.players.some(p => p.name === message.playerName)) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Player name already taken'
            }));
            break;
          }

          game.players.push({
            id: message.playerId,
            name: message.playerName,
            isHost: false,
            cards: [],
            score: 0,
            canSeeCorners: false
          });

          clients.set(ws, { playerId: message.playerId, gameCode: message.gameCode });

          const response = {
            type: 'GAME_JOINED',
            game
          };

          ws.send(JSON.stringify(response));
          broadcast(message.gameCode, response, ws);
          break;
        }

        case 'START_GAME': {
          const game = games.get(message.gameCode);
          
          if (!game || game.players.length < 2) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Need at least 2 players'
            }));
            break;
          }

          game.state = 'playing';
          game.deck = createDeck();
          game.discardPile = [game.deck.pop()];
          game.currentPlayerId = game.players[0].id;

          game.players.forEach(player => {
            player.cards = [
              game.deck.pop(),
              game.deck.pop(),
              game.deck.pop(),
              game.deck.pop()
            ];
            player.score = 0;
            player.canSeeCorners = true;
          });

          const response = {
            type: 'GAME_STARTED',
            game
          };

          broadcast(message.gameCode, response);
          ws.send(JSON.stringify(response));
          break;
        }

        case 'DRAW_CARD': {
          const game = games.get(message.gameCode);
          if (!game || game.currentPlayerId !== message.playerId) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Not your turn'
            }));
            break;
          }

          if (game.drawnCard) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Already drew a card this turn'
            }));
            break;
          }

          const card = game.deck.pop();
          game.drawnCard = card;

          const response = {
            type: 'CARD_DRAWN',
            game,
            drawnCard: card,
            playerId: message.playerId
          };

          broadcast(message.gameCode, response);
          ws.send(JSON.stringify(response));
          break;
        }

        case 'TAKE_DISCARD': {
          const game = games.get(message.gameCode);
          if (!game || game.currentPlayerId !== message.playerId) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Not your turn'
            }));
            break;
          }

          if (game.drawnCard) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Already drew a card this turn'
            }));
            break;
          }

          const card = game.discardPile.pop();
          game.drawnCard = card;

          const response = {
            type: 'CARD_DRAWN',
            game,
            drawnCard: card,
            playerId: message.playerId
          };

          broadcast(message.gameCode, response);
          ws.send(JSON.stringify(response));
          break;
        }

        case 'REPLACE_CARD': {
          const game = games.get(message.gameCode);
          if (!game || game.currentPlayerId !== message.playerId || !game.drawnCard) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Invalid action'
            }));
            break;
          }

          const player = game.players.find(p => p.id === message.playerId);
          const oldCard = player.cards[message.cardIndex];
          player.cards[message.cardIndex] = game.drawnCard;
          game.discardPile.push(oldCard);
          game.drawnCard = null;

          // Check if Cabo was called and handle end of round
          if (game.caboCallerId) {
            game.turnsAfterCabo++;
            if (game.turnsAfterCabo >= game.players.length) {
              // Round is over
              game.players.forEach(p => {
                p.score = calculateScore(p.cards);
              });
              game.state = 'finished';
            }
          }

          if (game.state === 'playing') {
            nextTurn(game);
            game.currentPlayerId = game.players[game.currentTurn].id;
          }

          const response = {
            type: 'CARD_REPLACED',
            game
          };

          broadcast(message.gameCode, response);
          ws.send(JSON.stringify(response));
          break;
        }

        case 'DISCARD_DRAWN': {
          const game = games.get(message.gameCode);
          if (!game || game.currentPlayerId !== message.playerId || !game.drawnCard) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Invalid action'
            }));
            break;
          }

          game.discardPile.push(game.drawnCard);
          game.drawnCard = null;

          // Check if Cabo was called
          if (game.caboCallerId) {
            game.turnsAfterCabo++;
            if (game.turnsAfterCabo >= game.players.length) {
              game.players.forEach(p => {
                p.score = calculateScore(p.cards);
              });
              game.state = 'finished';
            }
          }

          if (game.state === 'playing') {
            nextTurn(game);
            game.currentPlayerId = game.players[game.currentTurn].id;
          }

          const response = {
            type: 'CARD_DISCARDED',
            game
          };

          broadcast(message.gameCode, response);
          ws.send(JSON.stringify(response));
          break;
        }

        case 'CALL_CABO': {
          const game = games.get(message.gameCode);
          if (!game || game.currentPlayerId !== message.playerId) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Not your turn'
            }));
            break;
          }

          if (game.caboCallerId) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Cabo already called'
            }));
            break;
          }

          game.caboCallerId = message.playerId;
          game.turnsAfterCabo = 0;

          const response = {
            type: 'CABO_CALLED',
            game,
            callerName: game.players.find(p => p.id === message.playerId).name
          };

          broadcast(message.gameCode, response);
          ws.send(JSON.stringify(response));
          break;
        }

        case 'PEEK_OWN_CARD': {
          const game = games.get(message.gameCode);
          if (!game) break;

          const player = game.players.find(p => p.id === message.playerId);
          const card = player.cards[message.cardIndex];

          ws.send(JSON.stringify({
            type: 'CARD_PEEKED',
            card,
            cardIndex: message.cardIndex
          }));
          break;
        }

        case 'PEEK_OPPONENT_CARD': {
          const game = games.get(message.gameCode);
          if (!game) break;

          const opponent = game.players.find(p => p.id === message.opponentId);
          const card = opponent.cards[message.cardIndex];

          ws.send(JSON.stringify({
            type: 'OPPONENT_CARD_PEEKED',
            card,
            cardIndex: message.cardIndex,
            opponentId: message.opponentId
          }));
          break;
        }

        case 'SWITCH_CARDS': {
          const game = games.get(message.gameCode);
          if (!game) break;

          const player = game.players.find(p => p.id === message.playerId);
          const opponent = game.players.find(p => p.id === message.opponentId);

          const temp = player.cards[message.playerCardIndex];
          player.cards[message.playerCardIndex] = opponent.cards[message.opponentCardIndex];
          opponent.cards[message.opponentCardIndex] = temp;

          const response = {
            type: 'CARDS_SWITCHED',
            game
          };

          broadcast(message.gameCode, response);
          ws.send(JSON.stringify(response));
          break;
        }

        case 'LEAVE_GAME': {
          const clientInfo = clients.get(ws);
          if (clientInfo) {
            const game = games.get(clientInfo.gameCode);
            if (game) {
              game.players = game.players.filter(p => p.id !== clientInfo.playerId);
              
              if (game.players.length === 0) {
                games.delete(clientInfo.gameCode);
              } else {
                // If host left, assign new host
                if (game.host === clientInfo.playerId && game.players.length > 0) {
                  game.host = game.players[0].id;
                  game.players[0].isHost = true;
                }

                broadcast(clientInfo.gameCode, {
                  type: 'PLAYER_LEFT',
                  game
                });
              }
            }
            clients.delete(ws);
          }

          ws.send(JSON.stringify({ type: 'GAME_LEFT' }));
          break;
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    const clientInfo = clients.get(ws);
    if (clientInfo) {
      const game = games.get(clientInfo.gameCode);
      if (game) {
        game.players = game.players.filter(p => p.id !== clientInfo.playerId);
        if (game.players.length === 0) {
          games.delete(clientInfo.gameCode);
        } else {
          if (game.host === clientInfo.playerId && game.players.length > 0) {
            game.host = game.players[0].id;
            game.players[0].isHost = true;
          }
          broadcast(clientInfo.gameCode, {
            type: 'PLAYER_LEFT',
            game
          });
        }
      }
      clients.delete(ws);
    }
  });
});

console.log('Cabo WebSocket server running on ws://localhost:8080');