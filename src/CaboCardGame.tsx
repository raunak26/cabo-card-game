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
}

type MessageType = 
  | 'CREATE_GAME' 
  | 'JOIN_GAME' 
  | 'START_GAME' 
  | 'GAME_ACTION' 
  | 'LEAVE_GAME' 
  | 'GAME_CREATED' 
  | 'GAME_JOINED' 
  | 'GAME_STARTED' 
  | 'GAME_LEFT' 
  | 'ERROR';

interface ServerMessage {
  type: MessageType;
  gameCode?: string;
  game?: Game;
  message?: string;
  playerName?: string;
  playerId?: string;
}

// Global game storage that persists across component instances
const globalGameStorage = new Map<string, Game>();

// Global event emitter for cross-component communication
class GameEventEmitter {
  private listeners: { [key: string]: Array<(data: any) => void> } = {};

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string, callback: (data: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
}

const gameEventEmitter = new GameEventEmitter();

// Mock WebSocket class with global state synchronization
class MockWebSocket {
  public onmessage: ((event: { data: string }) => void) | null = null;
  private instanceId: string;

  constructor() {
    this.instanceId = Math.random().toString(36);
    
    // Listen for global game updates
    gameEventEmitter.on('gameUpdated', (data) => {
      // Don't send update back to the instance that created it
      if (data.sourceInstanceId !== this.instanceId && this.onmessage) {
        this.onmessage({
          data: JSON.stringify(data.message)
        });
      }
    });
  }

  send(data: string): void {
    const message: ServerMessage = JSON.parse(data);
    setTimeout(() => this.handleMessage(message), 100);
  }

  private broadcastUpdate(message: ServerMessage): void {
    gameEventEmitter.emit('gameUpdated', {
      message,
      sourceInstanceId: this.instanceId
    });
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'CREATE_GAME':
        this.createGame(message);
        break;
      case 'JOIN_GAME':
        this.joinGame(message);
        break;
      case 'START_GAME':
        this.startGame(message);
        break;
      case 'LEAVE_GAME':
        this.leaveGame(message);
        break;
    }
  }

  private createGame(message: ServerMessage): void {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game: Game = {
      code: code,
      host: message.playerId!,
      players: [{
        id: message.playerId!,
        name: message.playerName!,
        isHost: true,
        cards: [],
        score: 0,
        canSeeCorners: false
      }],
      state: 'lobby',
      currentTurn: 0,
      deck: [],
      discardPile: [],
      round: 1
    };
    
    globalGameStorage.set(code, game);

    const response = {
      type: 'GAME_CREATED' as MessageType,
      gameCode: code,
      game: game
    };

    this.sendMessage(response);
    this.broadcastUpdate(response);
  }

  private joinGame(message: ServerMessage): void {
    const game = globalGameStorage.get(message.gameCode!);
    if (!game) {
      this.sendMessage({
        type: 'ERROR',
        message: 'Game not found'
      });
      return;
    }

    if (game.players.length >= 8) {
      this.sendMessage({
        type: 'ERROR',
        message: 'Game is full'
      });
      return;
    }

    if (game.players.some(p => p.name === message.playerName)) {
      this.sendMessage({
        type: 'ERROR',
        message: 'Player name already taken in this game'
      });
      return;
    }

    game.players.push({
      id: message.playerId!,
      name: message.playerName!,
      isHost: false,
      cards: [],
      score: 0,
      canSeeCorners: false
    });

    globalGameStorage.set(message.gameCode!, game);

    const response = {
      type: 'GAME_JOINED' as MessageType,
      game: game
    };

    this.sendMessage(response);
    this.broadcastUpdate(response);
  }

  private startGame(message: ServerMessage): void {
    const game = globalGameStorage.get(message.gameCode!);
    if (!game || game.players.length < 2) return;

    game.state = 'playing';
    game.deck = this.createDeck();
    game.discardPile = [game.deck.pop()!];

    game.players.forEach(player => {
      player.cards = [
        game.deck.pop()!,
        game.deck.pop()!,
        game.deck.pop()!,
        game.deck.pop()!
      ];
      player.score = 0;
      player.canSeeCorners = true;
    });

    globalGameStorage.set(message.gameCode!, game);

    const response = {
      type: 'GAME_STARTED' as MessageType,
      game: game
    };

    this.sendMessage(response);
    this.broadcastUpdate(response);
  }

  private createDeck(): Card[] {
    const suits: Card['suit'][] = ['♠', '♥', '♦', '♣'];
    const values: Card['value'][] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck: Card[] = [];

    suits.forEach(suit => {
      values.forEach(value => {
        deck.push({ suit, value });
      });
    });

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  private leaveGame(message: ServerMessage): void {
    const response = { type: 'GAME_LEFT' as MessageType };
    this.sendMessage(response);
    this.broadcastUpdate(response);
  }

  private sendMessage(message: ServerMessage): void {
    if (this.onmessage) {
      this.onmessage({
        data: JSON.stringify(message)
      });
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
        <strong>Debug Info:</strong> Active games: {globalGameStorage.size}
        {globalGameStorage.size > 0 && (
          <div>Game codes: {Array.from(globalGameStorage.keys()).join(', ')}</div>
        )}
        <div style={{ marginTop: '10px', fontSize: '12px' }}>
          💡 <strong>Testing Tip:</strong> Open multiple browser tabs/windows and they should share the same game state!
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
  onDrawCard: () => void;
  onTakeDiscard: () => void;
  onCallCabo: () => void;
  onUseSpecialPower: () => void;
  onLeaveGame: () => void;
}> = ({ game, playerId, onDrawCard, onTakeDiscard, onCallCabo, onUseSpecialPower, onLeaveGame }) => {
  const currentPlayer = game.players.find(p => p.id === playerId);
  const topDiscard = game.discardPile[game.discardPile.length - 1];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>Game Code: {game.code}</div>
        <div>Turn: {game.players[game.currentTurn]?.name || ''}</div>
        <div>Round: {game.round}</div>
      </div>

      <div style={{ textAlign: 'center', padding: '15px', background: '#e6fffa', border: '2px solid #38b2ac', borderRadius: '10px', margin: '20px 0', fontWeight: 'bold', color: '#234e52' }}>
        Look at your corner cards to start!
      </div>

      {/* Deck Area */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '30px 0', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div 
            onClick={onDrawCard}
            style={{
              width: '80px',
              height: '120px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px',
              cursor: 'pointer',
              marginBottom: '10px',
              background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
              color: 'white'
            }}
          >
            DECK
          </div>
          <div>Draw Pile</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div 
            onClick={onTakeDiscard}
            style={{
              width: '80px',
              height: '120px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px',
              cursor: 'pointer',
              marginBottom: '10px',
              background: 'white',
              border: '2px solid #2d3748',
              color: isRedCard(topDiscard) ? '#e53e3e' : '#2d3748'
            }}
          >
            {topDiscard ? getCardDisplay(topDiscard) : '-'}
          </div>
          <div>Discard Pile</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', margin: '20px 0' }}>
        <button 
          onClick={onCallCabo}
          style={{
            background: 'linear-gradient(135deg, #ffd89b 0%, #19547b 100%)',
            fontSize: '18px',
            padding: '20px 40px'
          }}
        >
          Call CABO!
        </button>
        <button 
          onClick={onUseSpecialPower}
          style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}
        >
          Use Special Power
        </button>
      </div>

      {/* Players Area */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', margin: '20px 0' }}>
        {game.players.map((player) => {
          const isCurrentPlayer = player.id === playerId;
          return (
            <div 
              key={player.id}
              style={{
                background: isCurrentPlayer ? '#edf2f7' : '#f7fafc',
                padding: '15px',
                borderRadius: '10px',
                border: `2px solid ${isCurrentPlayer ? '#667eea' : '#e2e8f0'}`
              }}
            >
              <div><strong>{player.name}</strong> {isCurrentPlayer && '(You)'}</div>
              <div style={{ display: 'flex', gap: '10px', margin: '10px 0', flexWrap: 'wrap' }}>
                {player.cards.map((card, cardIndex) => {
                  let cardContent = '?';
                  let isVisible = false;
                  let cardColor = '#2d3748';

                  if (isCurrentPlayer) {
                    if (player.canSeeCorners && (cardIndex === 0 || cardIndex === 3)) {
                      cardContent = getCardDisplay(card);
                      isVisible = true;
                      cardColor = isRedCard(card) ? '#e53e3e' : '#2d3748';
                    }
                  }

                  return (
                    <div 
                      key={cardIndex}
                      style={{
                        width: '60px',
                        height: '90px',
                        border: isVisible ? '2px solid #2d3748' : '2px dashed #cbd5e0',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isVisible ? 'white' : (isCurrentPlayer ? 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)' : '#f7fafc'),
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: isVisible ? cardColor : (isCurrentPlayer ? 'white' : '#2d3748')
                      }}
                    >
                      {cardContent}
                    </div>
                  );
                })}
              </div>
              <div>Score: {player.score}</div>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center' }}>
        <button onClick={onLeaveGame}>Leave Game</button>
      </div>
    </div>
  );
};

const GameOverScreen: React.FC<{
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}> = ({ onPlayAgain, onBackToMenu }) => {
  return (
    <div className="card">
      <h2>Game Over!</h2>
      <div id="final-scores">Final scores would be displayed here</div>
      <div style={{ textAlign: 'center' }}>
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
    drawnCard: null
  });

  const [ws] = useState(() => new MockWebSocket());

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
          screen: 'game'
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
      drawnCard: null
    });
  };

  const handleDrawCard = () => {
    alert('Draw card functionality - would draw from deck');
  };

  const handleTakeDiscard = () => {
    alert('Take discard functionality - would take top discard card');
  };

  const handleCallCabo = () => {
    alert('Cabo called! All other players get one more turn.');
  };

  const handleUseSpecialPower = () => {
    alert('Special power functionality - based on card played');
  };

  const handlePlayAgain = () => {
    alert('Play again functionality');
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
            onDrawCard={handleDrawCard}
            onTakeDiscard={handleTakeDiscard}
            onCallCabo={handleCallCabo}
            onUseSpecialPower={handleUseSpecialPower}
            onLeaveGame={handleLeaveGame}
          />
        )}

        {gameState.screen === 'game-over' && (
          <GameOverScreen 
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
          />
        )}
      </div>
    </div>
  );
};

export default CaboCardGame;