import React, { useState, useEffect } from 'react';

// Types
interface Card {
  suit: '♠' | '♥' | '♦' | '♣';
  value: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  cards: Card[];
  score: number;
  canSeeCorners: boolean;
}

interface Game {
  code: string;
  host: string;
  players: Player[];
  state: 'lobby' | 'playing' | 'finished';
  currentTurn: number;
  deck: Card[];
  discardPile: Card[];
  round: number;
  drawnCard: Card | null;
  currentPlayerId: string | null;
  caboCallerId: string | null;
  turnsAfterCabo: number;
}

interface GameState {
  screen: 'menu' | 'lobby' | 'game' | 'game-over';
  playerName: string;
  gameCode: string;
  playerId: string | null;
  isHost: boolean;
  currentGame: Game | null;
  selectedCard: number | null;
  drawnCard: Card | null;
  peekedCards: Map<string, Card>;
  showSpecialPowerMenu: boolean;
}

type MessageType = 
  | 'CREATE_GAME' 
  | 'JOIN_GAME' 
  | 'START_GAME' 
  | 'DRAW_CARD'
  | 'TAKE_DISCARD'
  | 'REPLACE_CARD'
  | 'DISCARD_DRAWN'
  | 'CALL_CABO'
  | 'PEEK_OWN_CARD'
  | 'PEEK_OPPONENT_CARD'
  | 'SWITCH_CARDS'
  | 'GAME_ACTION' 
  | 'LEAVE_GAME' 
  | 'GAME_CREATED' 
  | 'GAME_JOINED' 
  | 'GAME_STARTED'
  | 'CARD_DRAWN'
  | 'CARD_REPLACED'
  | 'CARD_DISCARDED'
  | 'CABO_CALLED'
  | 'CARD_PEEKED'
  | 'OPPONENT_CARD_PEEKED'
  | 'CARDS_SWITCHED'
  | 'GAME_LEFT'
  | 'PLAYER_LEFT'
  | 'ERROR';

interface ServerMessage {
  type: MessageType;
  gameCode?: string;
  game?: Game;
  message?: string;
  playerName?: string;
  playerId?: string;
  drawnCard?: Card;
  card?: Card;
  cardIndex?: number;
  opponentId?: string;
  callerName?: string;
}

// Configuration for WebSocket connection
const WS_URL = 'ws://localhost:8080';

// Real WebSocket wrapper
class RealWebSocket {
  private ws: WebSocket | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  private messageQueue: string[] = [];

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.onopen = () => {
        console.log('Connected to server');
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          if (msg && this.ws) {
            this.ws.send(msg);
          }
        }
      };

      this.ws.onmessage = (event) => {
        if (this.onmessage) {
          this.onmessage({ data: event.data });
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('Disconnected from server');
        setTimeout(() => this.connect(), 3000);
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket server:', error);
    }
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.messageQueue.push(data);
    }
  }
}

// Utility functions
const getCardDisplay = (card: Card): string => {
  return card.value + card.suit;
};

const getCardValue = (card: Card): number => {
  switch (card.value) {
    case 'A': return 1;
    case 'J': return 11;
    case 'Q': return 12;
    case 'K': return card.suit === '♥' || card.suit === '♦' ? -1 : 13;
    default: return parseInt(card.value);
  }
};

const isRedCard = (card: Card): boolean => {
  return card.suit === '♥' || card.suit === '♦';
};

const hasSpecialPower = (card: Card): boolean => {
  return ['6', '7', '8', '9', '10', 'J', 'Q', 'K'].includes(card.value);
};

// Components
const MenuScreen: React.FC<{
  onCreateGame: (name: string) => void;
  onJoinGame: (name: string, code: string) => void;
}> = ({ onCreateGame, onJoinGame }) => {
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    onCreateGame(playerName.trim());
  };

  const handleJoinGame = () => {
    if (!playerName.trim() || !gameCode.trim()) {
      alert('Please enter your name and game code');
      return;
    }
    onJoinGame(playerName.trim(), gameCode.trim().toUpperCase());
  };

  return (
    <div className="card menu-screen" style={{ textAlign: 'center' }}>
      <h2 style={{ marginBottom: '30px', color: '#4a5568' }}>Welcome to Cabo!</h2>
      
      <div style={{ margin: '20px 0' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#2d3748' }}>
          Enter Your Name:
        </label>
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Your name"
          maxLength={20}
          style={{
            width: '100%',
            maxWidth: '300px',
            padding: '15px',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '16px'
          }}
        />
      </div>
      
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', margin: '20px 0' }}>
        <button onClick={handleCreateGame}>Create New Game</button>
        <button onClick={() => setShowJoin(true)}>Join Game</button>
      </div>

      {showJoin && (
        <div>
          <div style={{ margin: '20px 0' }}>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#2d3748' }}>
              Game Code:
            </label>
            <input
              type="text"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value)}
              placeholder="Enter game code"
              maxLength={6}
              style={{
                width: '100%',
                maxWidth: '300px',
                padding: '15px',
                border: '2px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '16px'
              }}
            />
          </div>
          <button onClick={handleJoinGame}>Join Game</button>
        </div>
      )}

      <div style={{ background: '#f7fafc', padding: '20px', borderRadius: '10px', margin: '20px 0' }}>
        <h3 style={{ marginBottom: '15px', color: '#2d3748' }}>Card Values & Powers</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '14px' }}>
          <div><strong>Values:</strong> A=1, 2-10=face, J=11, Q=12, K=13, Red K=-1</div>
          <div><strong>6,7:</strong> Look at your own card</div>
          <div><strong>8,9:</strong> Look at opponent's card</div>
          <div><strong>10,J:</strong> Blind switch with opponent</div>
          <div><strong>Q,Black K:</strong> Look & choose to switch</div>
        </div>
      </div>
      
      <div style={{ background: '#e6fffa', padding: '15px', borderRadius: '10px', fontSize: '14px', color: '#234e52' }}>
        <strong>🌐 Multiplayer Ready!</strong> Create a game and share the code with friends.
        <div style={{ marginTop: '10px', fontSize: '12px' }}>
          💡 <strong>How to play:</strong> Open this game in different browsers/tabs, use the same game code to join!
        </div>
        <div style={{ marginTop: '5px', fontSize: '12px', color: '#2c7a7b' }}>
          ⚙️ Requires WebSocket server running on ws://localhost:8080
        </div>
      </div>
    </div>
  );
};

const LobbyScreen: React.FC<{
  game: Game;
  isHost: boolean;
  onStartGame: () => void;
  onLeaveGame: () => void;
}> = ({ game, isHost, onStartGame, onLeaveGame }) => {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h2>Game Lobby</h2>
        <div style={{ background: '#e2e8f0', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', fontFamily: 'monospace' }}>
          Code: {game.code}
        </div>
      </div>
      
      <div style={{ textAlign: 'center', padding: '15px', background: '#e6fffa', border: '2px solid #38b2ac', borderRadius: '10px', margin: '20px 0', fontWeight: 'bold', color: '#234e52' }}>
        Waiting for players to join... ({game.players.length}/8 players)
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', margin: '20px 0' }}>
        {game.players.map((player) => (
          <div 
            key={player.id}
            style={{
              background: '#f7fafc',
              padding: '15px',
              borderRadius: '10px',
              border: `2px solid ${player.isHost ? '#f56565' : '#e2e8f0'}`
            }}
          >
            <div><strong>{player.name}</strong> {player.isHost && '(Host)'}</div>
          </div>
        ))}
      </div>
      
      <div style={{ textAlign: 'center' }}>
        <button 
          onClick={onStartGame}
          disabled={!isHost || game.players.length < 2}
        >
          {game.players.length < 2 ? 'Need 2+ players' : isHost ? 'Start Game' : 'Waiting for host'}
        </button>
        <button onClick={onLeaveGame}>Leave Game</button>
      </div>
    </div>
  );
};

const GameScreen: React.FC<{
  game: Game;
  playerId: string;
  drawnCard: Card | null;
  peekedCards: Map<string, Card>;
  showSpecialPowerMenu: boolean;
  onDrawCard: () => void;
  onTakeDiscard: () => void;
  onReplaceCard: (cardIndex: number) => void;
  onDiscardDrawn: () => void;
  onCallCabo: () => void;
  onPeekOwnCard: (cardIndex: number) => void;
  onPeekOpponentCard: (opponentId: string, cardIndex: number) => void;
  onSwitchCards: (opponentId: string, playerCardIndex: number, opponentCardIndex: number) => void;
  onToggleSpecialPowerMenu: () => void;
  onLeaveGame: () => void;
}> = ({ 
  game, 
  playerId, 
  drawnCard, 
  peekedCards,
  showSpecialPowerMenu,
  onDrawCard, 
  onTakeDiscard, 
  onReplaceCard,
  onDiscardDrawn,
  onCallCabo, 
  onPeekOwnCard,
  onPeekOpponentCard,
  onSwitchCards,
  onToggleSpecialPowerMenu,
  onLeaveGame 
}) => {
  const currentPlayer = game.players.find(p => p.id === playerId);
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  const isMyTurn = game.currentPlayerId === playerId;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>Game Code: <strong>{game.code}</strong></div>
        <div>Turn: <strong>{game.players.find(p => p.id === game.currentPlayerId)?.name || ''}</strong></div>
        <div>Round: <strong>{game.round}</strong></div>
      </div>

      {game.caboCallerId && (
        <div style={{ textAlign: 'center', padding: '15px', background: '#fff5f5', border: '2px solid #fc8181', borderRadius: '10px', margin: '20px 0', fontWeight: 'bold', color: '#c53030' }}>
          🎺 CABO called by {game.players.find(p => p.id === game.caboCallerId)?.name}! Everyone gets one more turn!
        </div>
      )}

      {isMyTurn ? (
        <div style={{ textAlign: 'center', padding: '15px', background: '#c6f6d5', border: '2px solid #38a169', borderRadius: '10px', margin: '20px 0', fontWeight: 'bold', color: '#22543d' }}>
          ✨ It's your turn! {drawnCard ? 'Choose a card to replace or discard' : 'Draw a card or take from discard pile'}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '15px', background: '#e6fffa', border: '2px solid #38b2ac', borderRadius: '10px', margin: '20px 0', fontWeight: 'bold', color: '#234e52' }}>
          Waiting for {game.players.find(p => p.id === game.currentPlayerId)?.name}'s turn...
        </div>
      )}

      {/* Drawn Card Display */}
      {drawnCard && isMyTurn && (
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>You drew:</div>
          <div 
            style={{
              width: '100px',
              height: '150px',
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '24px',
              background: 'white',
              border: '3px solid #4299e1',
              color: isRedCard(drawnCard) ? '#e53e3e' : '#2d3748',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          >
            {getCardDisplay(drawnCard)}
          </div>
          <div style={{ marginTop: '10px' }}>
            <button onClick={onDiscardDrawn}>Discard This Card</button>
          </div>
        </div>
      )}

      {/* Deck Area */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '30px 0', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div 
            onClick={isMyTurn && !drawnCard ? onDrawCard : undefined}
            style={{
              width: '80px',
              height: '120px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px',
              cursor: isMyTurn && !drawnCard ? 'pointer' : 'not-allowed',
              marginBottom: '10px',
              background: isMyTurn && !drawnCard ? 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)' : '#a0aec0',
              color: 'white',
              opacity: isMyTurn && !drawnCard ? 1 : 0.6
            }}
          >
            DECK
          </div>
          <div style={{ fontSize: '12px' }}>{game.deck.length} cards</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div 
            onClick={isMyTurn && !drawnCard ? onTakeDiscard : undefined}
            style={{
              width: '80px',
              height: '120px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px',
              cursor: isMyTurn && !drawnCard ? 'pointer' : 'not-allowed',
              marginBottom: '10px',
              background: 'white',
              border: `2px solid ${isMyTurn && !drawnCard ? '#2d3748' : '#cbd5e0'}`,
              color: topDiscard && isRedCard(topDiscard) ? '#e53e3e' : '#2d3748',
              opacity: isMyTurn && !drawnCard ? 1 : 0.6
            }}
          >
            {topDiscard ? getCardDisplay(topDiscard) : '-'}
          </div>
          <div style={{ fontSize: '12px' }}>Discard Pile</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', margin: '20px 0' }}>
        <button 
          onClick={onCallCabo}
          disabled={!isMyTurn || !!game.caboCallerId}
          style={{
            background: game.caboCallerId ? '#cbd5e0' : 'linear-gradient(135deg, #ffd89b 0%, #19547b 100%)',
            fontSize: '18px',
            padding: '20px 40px'
          }}
        >
          {game.caboCallerId ? 'CABO Called' : 'Call CABO!'}
        </button>
      </div>

      {/* Players Area */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', margin: '20px 0' }}>
        {game.players.map((player) => {
          const isCurrentPlayer = player.id === playerId;
          const isPlayerTurn = player.id === game.currentPlayerId;
          return (
            <div 
              key={player.id}
              style={{
                background: isPlayerTurn ? '#fef5e7' : (isCurrentPlayer ? '#edf2f7' : '#f7fafc'),
                padding: '15px',
                borderRadius: '10px',
                border: `3px solid ${isPlayerTurn ? '#f59e0b' : (isCurrentPlayer ? '#667eea' : '#e2e8f0')}`
              }}
            >
              <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                {player.name} {isCurrentPlayer && '(You)'} {isPlayerTurn && '🎯'}
              </div>
              <div style={{ display: 'flex', gap: '8px', margin: '10px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
                {player.cards.map((card, cardIndex) => {
                  let cardContent = '?';
                  let isVisible = false;
                  let cardColor = '#2d3748';
                  const peekKey = `${player.id}-${cardIndex}`;
                  const peekedCard = peekedCards.get(peekKey);

                  if (isCurrentPlayer) {
                    if (player.canSeeCorners && (cardIndex === 0 || cardIndex === 3)) {
                      cardContent = getCardDisplay(card);
                      isVisible = true;
                      cardColor = isRedCard(card) ? '#e53e3e' : '#2d3748';
                    } else if (peekedCard) {
                      cardContent = getCardDisplay(peekedCard);
                      isVisible = true;
                      cardColor = isRedCard(peekedCard) ? '#e53e3e' : '#2d3748';
                    }
                  } else if (peekedCard) {
                    cardContent = getCardDisplay(peekedCard);
                    isVisible = true;
                    cardColor = isRedCard(peekedCard) ? '#e53e3e' : '#2d3748';
                  }

                  const canReplace = isMyTurn && drawnCard && isCurrentPlayer;

                  return (
                    <div 
                      key={cardIndex}
                      onClick={() => canReplace && onReplaceCard(cardIndex)}
                      style={{
                        width: '60px',
                        height: '90px',
                        border: isVisible ? '2px solid #2d3748' : '2px dashed #cbd5e0',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isVisible ? 'white' : (isCurrentPlayer ? 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)' : '#e2e8f0'),
                        cursor: canReplace ? 'pointer' : 'default',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: isVisible ? cardColor : (isCurrentPlayer ? 'white' : '#718096'),
                        transition: 'transform 0.2s',
                        boxShadow: canReplace ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
                      }}
                      onMouseEnter={(e) => canReplace && (e.currentTarget.style.transform = 'scale(1.05)')}
                      onMouseLeave={(e) => canReplace && (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      {cardContent}
                    </div>
                  );
                })}
              </div>
              {game.state === 'finished' && (
                <div style={{ marginTop: '10px', fontWeight: 'bold', color: '#2d3748' }}>
                  Final Score: {player.score}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Special Powers Info */}
      <div style={{ background: '#f7fafc', padding: '15px', borderRadius: '10px', margin: '20px 0', fontSize: '13px' }}>
        <strong>💡 Tip:</strong> When you discard 6/7/8/9/10/J/Q/K, you can use their special powers!
        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '5px' }}>
          <div>6,7: Peek at your own card</div>
          <div>8,9: Peek at opponent's card</div>
          <div>10,J: Blind swap with opponent</div>
          <div>Q,Black K: Peek & choose to swap</div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button onClick={onLeaveGame}>Leave Game</button>
      </div>
    </div>
  );
};

const GameOverScreen: React.FC<{
  game: Game;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}> = ({ game, onPlayAgain, onBackToMenu }) => {
  const sortedPlayers = [...game.players].sort((a, b) => a.score - b.score);
  const winner = sortedPlayers[0];

  return (
    <div className="card">
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>🎉 Game Over! 🎉</h2>
      
      <div style={{ textAlign: 'center', padding: '20px', background: '#fef5e7', border: '3px solid #f59e0b', borderRadius: '10px', margin: '20px 0' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#92400e', marginBottom: '10px' }}>
          🏆 Winner: {winner.name} 🏆
        </div>
        <div style={{ fontSize: '18px', color: '#78350f' }}>
          Score: {winner.score}
        </div>
      </div>

      <div style={{ margin: '20px 0' }}>
        <h3 style={{ marginBottom: '15px', textAlign: 'center' }}>Final Scores</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sortedPlayers.map((player, index) => (
            <div 
              key={player.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '15px',
                background: index === 0 ? '#fef3c7' : '#f7fafc',
                border: `2px solid ${index === 0 ? '#f59e0b' : '#e2e8f0'}`,
                borderRadius: '10px'
              }}
            >
              <div>
                <span style={{ fontWeight: 'bold', marginRight: '10px' }}>
                  {index + 1}.
                </span>
                {player.name}
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                {player.score} points
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <button onClick={onPlayAgain}>Play Again</button>
        <button onClick={onBackToMenu}>Back to Menu</button>
      </div>
    </div>
  );
};

// Main App Component
const CaboCardGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    screen: 'menu',
    playerName: '',
    gameCode: '',
    playerId: null,
    isHost: false,
    currentGame: null,
    selectedCard: null,
    drawnCard: null,
    peekedCards: new Map(),
    showSpecialPowerMenu: false
  });

  const [ws] = useState(() => new RealWebSocket());

  useEffect(() => {
    ws.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      handleServerMessage(message);
    };
  }, [ws]);

  const handleServerMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'GAME_CREATED':
        setGameState(prev => ({
          ...prev,
          gameCode: message.gameCode!,
          currentGame: message.game!,
          screen: 'lobby'
        }));
        break;

      case 'GAME_JOINED':
        setGameState(prev => ({
          ...prev,
          currentGame: message.game!,
          screen: 'lobby'
        }));
        break;

      case 'GAME_STARTED':
        setGameState(prev => ({
          ...prev,
          currentGame: message.game!,
          screen: 'game',
          peekedCards: new Map()
        }));
        break;

      case 'CARD_DRAWN':
        setGameState(prev => ({
          ...prev,
          currentGame: message.game!,
          drawnCard: message.playerId === prev.playerId ? message.drawnCard! : prev.drawnCard
        }));
        break;

      case 'CARD_REPLACED':
      case 'CARD_DISCARDED':
        setGameState(prev => ({
          ...prev,
          currentGame: message.game!,
          drawnCard: null
        }));
        if (message.game!.state === 'finished') {
          setGameState(prev => ({ ...prev, screen: 'game-over' }));
        }
        break;

      case 'CABO_CALLED':
        setGameState(prev => ({
          ...prev,
          currentGame: message.game!
        }));
        alert(`${message.callerName} called CABO! Everyone gets one more turn!`);
        break;

      case 'CARD_PEEKED':
        setGameState(prev => {
          const newPeekedCards = new Map(prev.peekedCards);
          newPeekedCards.set(`${prev.playerId}-${message.cardIndex}`, message.card!);
          return {
            ...prev,
            peekedCards: newPeekedCards
          };
        });
        alert(`You peeked at your card: ${getCardDisplay(message.card!)}`);
        break;

      case 'OPPONENT_CARD_PEEKED':
        setGameState(prev => {
          const newPeekedCards = new Map(prev.peekedCards);
          newPeekedCards.set(`${message.opponentId}-${message.cardIndex}`, message.card!);
          return {
            ...prev,
            peekedCards: newPeekedCards
          };
        });
        alert(`You peeked at opponent's card: ${getCardDisplay(message.card!)}`);
        break;

      case 'CARDS_SWITCHED':
        setGameState(prev => ({
          ...prev,
          currentGame: message.game!
        }));
        alert('Cards have been switched!');
        break;

      case 'PLAYER_LEFT':
        setGameState(prev => ({
          ...prev,
          currentGame: message.game!
        }));
        break;

      case 'GAME_LEFT':
        handleBackToMenu();
        break;

      case 'ERROR':
        alert(message.message);
        break;
    }
  };

  const handleCreateGame = (playerName: string) => {
    const playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    setGameState(prev => ({
      ...prev,
      playerName,
      playerId,
      isHost: true
    }));

    ws.send(JSON.stringify({
      type: 'CREATE_GAME',
      playerName,
      playerId
    }));
  };

  const handleJoinGame = (playerName: string, gameCode: string) => {
    const playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    setGameState(prev => ({
      ...prev,
      playerName,
      gameCode,
      playerId
    }));

    ws.send(JSON.stringify({
      type: 'JOIN_GAME',
      playerName,
      playerId,
      gameCode
    }));
  };

  const handleStartGame = () => {
    ws.send(JSON.stringify({
      type: 'START_GAME',
      gameCode: gameState.gameCode
    }));
  };

  const handleLeaveGame = () => {
    ws.send(JSON.stringify({
      type: 'LEAVE_GAME',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId
    }));
  };

  const handleBackToMenu = () => {
    setGameState({
      screen: 'menu',
      playerName: '',
      gameCode: '',
      playerId: null,
      isHost: false,
      currentGame: null,
      selectedCard: null,
      drawnCard: null,
      peekedCards: new Map(),
      showSpecialPowerMenu: false
    });
  };

  const handleDrawCard = () => {
    ws.send(JSON.stringify({
      type: 'DRAW_CARD',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId
    }));
  };

  const handleTakeDiscard = () => {
    ws.send(JSON.stringify({
      type: 'TAKE_DISCARD',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId
    }));
  };

  const handleReplaceCard = (cardIndex: number) => {
    ws.send(JSON.stringify({
      type: 'REPLACE_CARD',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId,
      cardIndex
    }));
  };

  const handleDiscardDrawn = () => {
    ws.send(JSON.stringify({
      type: 'DISCARD_DRAWN',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId
    }));
  };

  const handleCallCabo = () => {
    if (window.confirm('Are you sure you want to call CABO? Everyone will get one more turn!')) {
      ws.send(JSON.stringify({
        type: 'CALL_CABO',
        gameCode: gameState.gameCode,
        playerId: gameState.playerId
      }));
    }
  };

  const handlePeekOwnCard = (cardIndex: number) => {
    ws.send(JSON.stringify({
      type: 'PEEK_OWN_CARD',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId,
      cardIndex
    }));
  };

  const handlePeekOpponentCard = (opponentId: string, cardIndex: number) => {
    ws.send(JSON.stringify({
      type: 'PEEK_OPPONENT_CARD',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId,
      opponentId,
      cardIndex
    }));
  };

  const handleSwitchCards = (opponentId: string, playerCardIndex: number, opponentCardIndex: number) => {
    ws.send(JSON.stringify({
      type: 'SWITCH_CARDS',
      gameCode: gameState.gameCode,
      playerId: gameState.playerId,
      opponentId,
      playerCardIndex,
      opponentCardIndex
    }));
  };

  const handleToggleSpecialPowerMenu = () => {
    setGameState(prev => ({
      ...prev,
      showSpecialPowerMenu: !prev.showSpecialPowerMenu
    }));
  };

  const handlePlayAgain = () => {
    alert('Play again functionality - would reset the game');
  };

  return (
    <div style={{
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      color: '#333'
    }}>
      <style>
        {`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            margin: 10px;
            transition: transform 0.2s, box-shadow 0.2s;
          }

          button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
          }

          button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
          }

          input:focus {
            outline: none;
            border-color: #667eea !important;
          }

          .card {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin: 20px;
          }
        `}
      </style>
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <h1 style={{ 
          textAlign: 'center', 
          color: 'white', 
          marginBottom: '30px', 
          fontSize: '3em', 
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)' 
        }}>
          🎴 Cabo Card Game
        </h1>

        {gameState.screen === 'menu' && (
          <MenuScreen 
            onCreateGame={handleCreateGame}
            onJoinGame={handleJoinGame}
          />
        )}

        {gameState.screen === 'lobby' && gameState.currentGame && (
          <LobbyScreen 
            game={gameState.currentGame}
            isHost={gameState.isHost}
            onStartGame={handleStartGame}
            onLeaveGame={handleLeaveGame}
          />
        )}

        {gameState.screen === 'game' && gameState.currentGame && gameState.playerId && (
          <GameScreen 
            game={gameState.currentGame}
            playerId={gameState.playerId}
            drawnCard={gameState.drawnCard}
            peekedCards={gameState.peekedCards}
            showSpecialPowerMenu={gameState.showSpecialPowerMenu}
            onDrawCard={handleDrawCard}
            onTakeDiscard={handleTakeDiscard}
            onReplaceCard={handleReplaceCard}
            onDiscardDrawn={handleDiscardDrawn}
            onCallCabo={handleCallCabo}
            onPeekOwnCard={handlePeekOwnCard}
            onPeekOpponentCard={handlePeekOpponentCard}
            onSwitchCards={handleSwitchCards}
            onToggleSpecialPowerMenu={handleToggleSpecialPowerMenu}
            onLeaveGame={handleLeaveGame}
          />
        )}

        {gameState.screen === 'game-over' && gameState.currentGame && (
          <GameOverScreen 
            game={gameState.currentGame}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
          />
        )}
      </div>
    </div>
  );
};

export default CaboCardGame;