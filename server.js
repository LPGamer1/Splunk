require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB
mongoose.connect(process.env.MONGODB_URI);
const User = mongoose.model('User', new mongoose.Schema({
  discordId: String,
  username: String,
  avatar: String,
  accessToken: String,
  createdAt: { type: Date, default: Date.now }
}));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 dias
}));

app.use(express.static('public'));
app.use(express.json());

// Página inicial - se já logado vai direto pro dashboard
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota que inicia o fluxo de verificação
app.get('/getkey', (req, res) => {
  const redirectUrl = `https://hunter-bot-verify.onrender.com/key?redirect=https://${req.get('host')}/sucess`;
  res.redirect(redirectUrl);
});

// Rota que recebe o token do Hunter Bot
app.get('/sucess', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.send('<h1 style="color:red; text-align:center; margin-top:20vh;">Erro: Token não recebido!</h1>');
  }

  try {
    // Usa o token do Hunter Bot para pegar os dados do usuário no Discord
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const user = userResponse.data;

    // Salva/atualiza usuário no banco
    await User.findOneAndUpdate(
      { discordId: user.id },
      {
        discordId: user.id,
        username: user.global_name || user.username,
        avatar: user.avatar
      },
      { upsert: true }
    );

    // Loga o usuário na sessão
    req.session.user = {
      id: user.id,
      username: user.global_name || user.username + '#' + user.discriminator,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/\( {user.id}/ \){user.avatar}.png` : null
    };

    // Redireciona pro dashboard com visual cyberpunk
    res.sendFile(path.join(__dirname, 'views', 'sucess.html'));
  } catch (err) {
    console.error("Erro ao validar token:", err.response?.data || err.message);
    res.send(`
      <h1 style="color:#ff00aa; text-align:center; margin-top:20vh; font-family:Orbitron;">
        Token inválido ou expirado!
      </h1>
      <p style="text-align:center;"><a href="/getkey" style="color:#00d9ff;">Tentar novamente</a></p>
    `);
  }
});

// Rotas protegidas
const auth = (req, res, next) => req.session.user ? next() : res.redirect('/');
app.get('/dashboard', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/hits', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'hits.html')));
app.get('/settings', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/bypasser', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'bypasser.html')));

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Painel rodando → https://splunk-lp.onrender.com`);
});
