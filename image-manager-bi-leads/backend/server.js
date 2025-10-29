// backend/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = 3000;

// 静态前端
app.use('/frontend', express.static(path.join(__dirname,'../frontend')));
app.use('/uploads', express.static(path.join(__dirname,'../uploads')));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 创建文件夹
const uploadsDir = path.join(__dirname,'../uploads');
const dbDir = path.join(__dirname,'../db');
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if(!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// multer 配置（可上传附件）
const storage = multer.diskStorage({
  destination: (req,file,cb)=> cb(null, uploadsDir),
  filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// 初始化 SQLite
const DB_FILE = path.join(dbDir,'data.db');
const db = new sqlite3.Database(DB_FILE);

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    city TEXT,
    source TEXT,
    intent TEXT,
    message TEXT,
    score INTEGER,
    created_at TEXT
  )`);
});

// 简单离线评分函数（规则可扩展）
function scoreLead({name, phone, city, intent, message}){
  let score = 0;
  // 手机号存在 +20
  if(phone && phone.trim().length >= 6) score += 30;
  // 意向关键词判断
  if(intent){
    const intentLow = intent.toLowerCase();
    if(intentLow.includes('急') || intentLow.includes('马上') || intentLow.includes('要')) score += 30;
    else if(intentLow.includes('想') || intentLow.includes('咨询')) score += 15;
  }
  // 内容长度
  if(message && message.trim().length > 30) score += 20;
  // 城市匹配你目标区域（示例：昆山/苏州/上海）
  if(city){
    const targets = ['昆山','苏州','上海','太仓','常熟','嘉定','宝山','青浦'];
    if(targets.some(t => city.includes(t))) score += 10;
  }
  // 限制范围 0-100
  if(score > 100) score = 100;
  return score;
}

// API: 提交线索（落地页用）
app.post('/api/lead', upload.single('attachment'), (req,res)=>{
  try{
    const { name, phone, city, source, intent, message } = req.body;
    const created_at = new Date().toISOString();
    const score = scoreLead({name,phone,city,intent,message});
    db.run(
      `INSERT INTO leads (name, phone, city, source, intent, message, score, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [name || '', phone || '', city || '', source || '', intent || '', message || '', score, created_at],
      function(err){
        if(err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID, score });
      }
    );
  }catch(e){
    res.status(500).json({error: e.message});
  }
});

// API: 获取线索列表（可按score或source过滤）
app.get('/api/leads', (req,res)=>{
  const { minScore, source } = req.query;
  let sql = 'SELECT * FROM leads';
  const params = [];
  if(minScore || source){
    const cond = [];
    if(minScore){ cond.push('score >= ?'); params.push(Number(minScore)); }
    if(source){ cond.push('source = ?'); params.push(source); }
    sql += ' WHERE ' + cond.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';
  db.all(sql, params, (err, rows)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: 删除线索
app.delete('/api/leads/:id', (req,res)=>{
  const id = req.params.id;
  db.run('DELETE FROM leads WHERE id = ?', [id], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: 导出 CSV（简单实现）
app.get('/api/leads-export', (req,res)=>{
  db.all('SELECT * FROM leads ORDER BY created_at DESC', [], (err, rows)=>{
    if(err) return res.status(500).send('Error');
    const header = ['id','name','phone','city','source','intent','message','score','created_at'];
    const lines = [header.join(',')];
    rows.forEach(r=>{
      const line = header.map(h => {
        const v = r[h] === null || r[h] === undefined ? '' : String(r[h]).replace(/"/g,'""');
        return `"${v}"`;
      }).join(',');
      lines.push(line);
    });
    const csv = lines.join('\n');
    res.setHeader('Content-disposition','attachment; filename=leads.csv');
    res.setHeader('Content-Type','text/csv;charset=utf-8');
    res.send(csv);
  });
});

// 启动
app.listen(PORT, ()=> console.log(`Local lead backend running at http://localhost:${PORT}/frontend`));
