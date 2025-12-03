require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect("mongodb+srv://admin:lp@cluster.5mwrlvm.mongodb.net/splunklp?retryWrites=true&w=majority");

const TrustedIP = mongoose.model('TrustedIP', new mongoose.Schema({
  ip: String,
  discordId: String,
  username: String,
  lastSeen: Date
}, { collection: 'trustedips' }));

app.use(session({
  secret: 'adminlp',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: "mongodb+srv://admin:lp@cluster.5mwrlvm.mongodb.net/splunklp" }),
  cookie: { maxAge: 365 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static('public'));
app.set('views', path.join(__dirname, 'views'));

function getIP(req) {
  return req.headers['cf-connecting-ip'] || 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         req.ip;
}

// Página principal
app.get('/', async (req, res) => {
  const ip = getIP(req);
  const trusted = await TrustedIP.findOne({ ip });
  if (trusted) {
    req.session.user = { id: trusted.discordId, username: trusted.username };
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Recebe do Hunter Bot → mostra tela de sucesso → vai pro dashboard
app.get('/sucess', async (req, res) => {
  const { token, ip: hunterIP } = req.query;

  if (!token) {
    return res.send('<h1 style="color:red;text-align:center;padding-top:20vh;font-family:sans-serif">Erro: token não recebido</h1>');
  }

  try {
    const { data: user } = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const realIP = hunterIP || getIP(req);

    await TrustedIP.findOneAndUpdate(
      { ip: realIP },
      { ip: realIP, discordId: user.id, username: user.global_name || user.username, lastSeen: new Date() },
      { upsert: true }
    );

    req.session.user = {
      id: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/\( {user.id}/ \){user.avatar}.png` : null
    };

    // Mostra a tela de sucesso por 3 segundos
    res.sendFile(path.join(__dirname, 'views', 'sucess.html'));
  } catch (err) {
    res.send(`
      <div style="background:#000;color:#ff3366;text-align:center;padding-top:20vh;font-family:sans-serif">
        <h1>Token inválido ou expirado</h1>
        <p><a href="/" style="color:#00ffff">Voltar</a></p>
      </div>
    `);
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => console.log('Splunk LP rodando com sucesso!'));
