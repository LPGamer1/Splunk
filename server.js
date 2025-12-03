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
  cookie: { maxAge: 365*24*60*60*1000 }
}));

app.use(express.static('public'));
app.set('views', path.join(__dirname, 'views'));

function getIP(r){ return r.headers['cf-connecting-ip'] || r.ip; }

// Página principal
app.get('/', async (req, res) => {
  const ip = getIP(req);
  const trust = await Trusted.findOne({ ip });
  if (trust) req.session.user = { id: trust.discordId, name: trust.username };
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Recebe do Hunter Bot
app.get('/sucess', async (req, res) => {
  const { token, ip: botIP } = req.query;
  if (!token) return res.send('<h1 style="color:red">Token não recebido</h1>');

  try {
    const { data: u } = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
    const realIP = botIP || getIP(req);

    await Trusted.findOneAndUpdate({ ip: realIP }, { discordId: u.id, username: u.global_name || u.username }, { upsert: true });
    req.session.user = { id: u.id, name: u.global_name || u.username };

    res.sendFile(path.join(__dirname, 'views', 'sucess.html'));
  } catch { res.send('<h1 style="color:#ff3366">Token inválido</h1><a href="/">Voltar</a>'); }
});

app.get('/logout', (req,res)=>{ req.session.destroy(); res.redirect('/'); });

app.listen(process.env.PORT || 3000);
