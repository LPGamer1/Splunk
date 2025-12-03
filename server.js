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
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true});
console.log('MongoDB conectado');

// Modelo para IP confiável
const TrustedIP = mongoose.model('TrustedIP', new mongoose.Schema({
  ip: { type: String, unique: true },
  discordId: String,
  username: String,
  lastSeen: { type: Date, default: Date.now }
}));

// Session (1 ano de validade)
app.use(session({
  secret: process.env.SESSION_SECRET || 'splunk_lp_never_login_again_2025',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 365 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static('public'));

// Pegar IP real (Render + Cloudflare)
function getClientIP(req) {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0] ||
         req.ip ||
         req.socket.remoteAddress;
}

// TELA INICIAL
app.get('/', async (req, res) => {
  const ip = getClientIP(req);

  // Se o IP já for confiável → entra direto
  const trusted = await TrustedIP.findOne({ ip });
  if (trusted) {
    req.session.user = {
      id: trusted.discordId,
      username: trusted.username,
      trusted: true
    };
    return res.redirect('/dashboard');
  }

  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ROTA FINAL – recebe do Hunter Bot
app.get('/sucess', async (req, res) => {
  const { token, ip: providedIP } = req.query;

  if (!token) {
    return res.send('<h1 style="color:red;text-align:center;margin-top:20vh;">Erro: Token não recebido do Hunter Bot</h1>'));
  }

  try {
    // Pega dados do usuário com o token
    const { data: user } = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Usa o IP que o Hunter Bot mandou (mais confiável)
    const realIP = providedIP || getClientIP(req);

    // Salva IP como confiável permanentemente
    await TrustedIP.findOneAndUpdate(
      { ip: realIP },
      {
        ip: realIP,
        discordId: user.id,
        username: user.global_name || user.username
      },
      { upsert: true }
    );

    // Loga o usuário
    req.session.user = {
      id: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/\( {user.id}/ \){user.avatar}.png` : null,
      trusted: true
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send(`
      <h1 style="color:#ff00aa;text-align:center;margin-top:20vh;font-family:Orbitron;">
        Token inválido ou expirado
      </h1>
      <p style="text-align:center;"><a href="/" style="color:#00d9ff;">Voltar e tentar novamente</a></p>
    `);
  }
});

// Rotas protegidas
const requireLogin = (req, res, next) => {
  if (req.session.user) return next();
  res.redirect('/');
};

app.get('/dashboard', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/hits', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'hits.html')));
app.get('/settings', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/bypasser', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'bypasser.html')));

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Splunk LP rodando → https://splunk-lp.onrender.com`));
