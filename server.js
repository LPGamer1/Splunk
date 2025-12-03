const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();

mongoose.connect("mongodb+srv://admin:lp@cluster.5mwrlvm.mongodb.net/splunklp?retryWrites=true&w=majority");

const Trusted = mongoose.model('Trusted', { ip: String, discordId: String, username: String });

app.use(session({
  secret: 'adminlp',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: "mongodb+srv://admin:lp@cluster.5mwrlvm.mongodb.net/splunklp" }),
  cookie: { secure: false, httpOnly: true, maxAge: 365*24*60*60*1000 }
}));

app.use(express.static('public'));
app.set('views', path.join(__dirname, 'views'));

function getIP(r) {
  return r.headers['cf-connecting-ip'] || r.headers['x-forwarded-for']?.split(',')[0] || r.ip || r.socket.remoteAddress;
}

// Página principal
app.get('/', async (req, res) => {
  const ip = getIP(req);
  const trusted = await Trusted.findOne({ ip });
  if (trusted && !req.session.user) {
    req.session.user = { id: trusted.discordId, name: trusted.username };
    req.session.save(); // FORÇA salvar a sessão
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Recebe do Hunter Bot
app.get('/sucess', async (req, res) => {
  const { token, ip: botIP } = req.query;
  if (!token) return res.send('<h1 style="color:red">Erro: token não recebido</h1>');

  try {
    const { data: user } = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const realIP = botIP || getIP(req);

    await Trusted.findOneAndUpdate(
      { ip: realIP },
      { discordId: user.id, username: user.global_name || user.username },
      { upsert: true }
    );

    // FORÇA criar a sessão
    req.session.user = { id: user.id, name: user.global_name || user.username };
    await new Promise(resolve => req.session.save(resolve)); // espera salvar

    res.sendFile(path.join(__dirname, 'views', 'sucess.html'));
  } catch (e) {
    res.send('<h1 style="color:#ff3366">Token inválido ou expirado</h1><a href="/">Tentar novamente</a>');
  }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000, () => console.log('Splunk LP rodando'));
