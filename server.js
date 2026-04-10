const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let currentLetter = "";
let usedLetters = []; 
let allScores = {}; 
let currentRoundAnswers = {}; 
let roomLeader = null;

io.on('connection', (socket) => {
    // Oda boşsa bağlanan ilk kişiyi lider adayı yap
    if (!roomLeader || io.engine.clientsCount === 1) {
        roomLeader = socket.id;
    }

    socket.on('registerPlayer', (name) => {
        if (!allScores[name]) allScores[name] = 0;
        
        // Kayıt olan kişi oda lideri mi kontrol et
        if (socket.id === roomLeader) {
            socket.emit('adminStatus', true);
        }

        io.emit('chatMessage', { name: "Sistem", msg: `${name} oyuna katıldı!` });
        io.emit('updateLeaderboard', allScores);
        socket.emit('historyUpdate', usedLetters);
    });

    socket.on('requestNewLetter', () => {
        if (socket.id === roomLeader) {
            const letters = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ";
            let availableLetters = letters.split('').filter(l => !usedLetters.includes(l));
            if (availableLetters.length === 0) { usedLetters = []; availableLetters = letters.split(''); }

            currentLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
            currentRoundAnswers = {}; 
            io.emit('startNewRound', { letter: currentLetter });
        }
    });

    socket.on('submitAnswers', (data) => {
        const name = data.playerName;
        currentRoundAnswers[name] = data.answers;
        const submittedCount = Object.keys(currentRoundAnswers).length;
        const activePlayersCount = io.sockets.sockets.size; 

        if (submittedCount >= activePlayersCount) {
            calculateRoundScores();
        } else {
            io.emit('chatMessage', { name: "Sistem", msg: `📝 ${name} teslim etti! (${submittedCount}/${activePlayersCount})` });
        }
    });

    function calculateRoundScores() {
        if (!usedLetters.includes(currentLetter)) usedLetters.push(currentLetter);
        let players = Object.keys(currentRoundAnswers);
        players.forEach(name => {
            let scoreGained = 0;
            let myAns = currentRoundAnswers[name];
            for (let kat in myAns) {
                let kelime = (myAns[kat] || "").trim().toUpperCase();
                if (kelime !== "" && kelime.startsWith(currentLetter)) {
                    let sameCount = 0;
                    players.forEach(other => {
                        let otherK = (currentRoundAnswers[other][kat] || "").trim().toUpperCase();
                        if (kelime === otherK) sameCount++;
                    });
                    scoreGained += (sameCount > 1) ? 5 : 10;
                }
            }
            allScores[name] = (allScores[name] || 0) + scoreGained;
        });
        io.emit('roundFinished', { allScores: allScores });
        io.emit('historyUpdate', usedLetters);
        io.emit('chatMessage', { name: "Sistem", msg: "🔔 Tur bitti, puanlar eklendi!" });
    }

    socket.on('sendChatMessage', (data) => { io.emit('chatMessage', data); });

    socket.on('disconnect', () => {
        if (socket.id === roomLeader) {
            roomLeader = null;
            const remainingSockets = Array.from(io.sockets.sockets.values());
            if (remainingSockets.length > 0) {
                roomLeader = remainingSockets[0].id;
                io.to(roomLeader).emit('adminStatus', true);
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu aktif: http://localhost:${PORT}`);
});