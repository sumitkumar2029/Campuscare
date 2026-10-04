const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const categories = ['Electrical','Wi-Fi/Network','Water','Hostel','Classroom','Sanitation','Furniture','Other'];
const departments = ['Electrical Maintenance','IT / Network','Hostel Maintenance','Civil Maintenance','Sanitation','General Maintenance'];
const statuses = ['Pending','Verified','Assigned','In Progress','Resolved'];

function now() { return new Date().toISOString(); }
function readData() {
  if (!fs.existsSync(DATA_FILE)) return { issues: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { issues: [] }; }
}
function writeData(data) {
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function nextComplaintId(issues) {
  let max = 1023;
  for (const issue of issues) {
    const n = Number(String(issue.id).replace(/^CF/, ''));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `CF${max + 1}`;
}
function departmentFor(category) {
  return ({
    Electrical: 'Electrical Maintenance',
    'Wi-Fi/Network': 'IT / Network',
    Water: 'Hostel Maintenance',
    Hostel: 'Hostel Maintenance',
    Classroom: 'General Maintenance',
    Sanitation: 'Sanitation',
    Furniture: 'General Maintenance',
    Other: 'General Maintenance'
  })[category] || 'General Maintenance';
}
function priorityFor(category, urgency, description, reports = 1) {
  let score = ({ Low: 10, Medium: 25, High: 40, Critical: 60 })[urgency] || 25;
  if (category === 'Electrical') score += 20;
  if (category === 'Water') score += 15;
  const text = `${category} ${description}`.toLowerCase();
  ['fire','spark','shock','exposed wire','danger','leakage','flood','broken pipe'].forEach(w => {
    if (text.includes(w)) score += 20;
  });
  score += Math.min(Math.max(reports - 1, 0) * 5, 15);
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}
function tokens(text) {
  return String(text).toLowerCase().split(/\W+/).filter(w => w.length > 3);
}
function findDuplicate(issues, category, location, description) {
  const words = tokens(description);
  let best = null;
  let bestScore = 0;
  for (const issue of issues) {
    if (issue.category !== category || issue.location !== location || issue.status === 'Resolved') continue;
    const existing = new Set(tokens(issue.description));
    const matches = words.filter(w => existing.has(w)).length;
    const score = words.length ? 40 + Math.min((matches / words.length) * 40, 40) : 40;
    if (score > bestScore) { bestScore = score; best = issue; }
  }
  return bestScore >= 65 ? { issue: best, score: Math.round(bestScore) } : null;
}
function seed() {
  const base = now();
  return [
    { id:'CF1024', title:'Broken street light', description:'Street light near the CS Block entrance is not working during the evening.', category:'Electrical', location:'CS Block', priority:'High', status:'Pending', reportedBy:'Rahul Kumar', department:'Electrical Maintenance', reports:3, photoUrl:null, createdAt:base, updatedAt:base, updates:[{status:'Reported',comment:'Issue submitted by student.',updatedBy:'Student',createdAt:base}] },
    { id:'CF1025', title:'Water leakage', description:'Continuous water leakage near the ground floor washroom of Hostel Block B.', category:'Water', location:'Hostel Block B', priority:'Critical', status:'In Progress', reportedBy:'Aman Singh', department:'Hostel Maintenance', reports:5, photoUrl:null, createdAt:base, updatedAt:base, updates:[
      {status:'Reported',comment:'Water leakage reported with photo evidence.',updatedBy:'Student',createdAt:base},
      {status:'Verified',comment:'Maintenance supervisor verified the issue.',updatedBy:'CampusFix Admin',createdAt:base},
      {status:'Assigned',comment:'Assigned to Hostel Maintenance.',updatedBy:'CampusFix Admin',createdAt:base},
      {status:'In Progress',comment:'Maintenance team is inspecting the pipeline.',updatedBy:'CampusFix Admin',createdAt:base}
    ]},
    { id:'CF1026', title:'Wi-Fi not working', description:'Wi-Fi connectivity is unavailable in the reading area of the library.', category:'Wi-Fi/Network', location:'Library', priority:'High', status:'Resolved', reportedBy:'Priya Sharma', department:'IT / Network', reports:7, photoUrl:null, createdAt:base, updatedAt:base, updates:[
      {status:'Reported',comment:'Students reported no connectivity.',updatedBy:'Student',createdAt:base},
      {status:'Assigned',comment:'Assigned to IT / Network.',updatedBy:'CampusFix Admin',createdAt:base},
      {status:'In Progress',comment:'Network equipment inspected.',updatedBy:'CampusFix Admin',createdAt:base},
      {status:'Resolved',comment:'Access point restarted and connectivity restored.',updatedBy:'CampusFix Admin',createdAt:base}
    ]},
    { id:'CF1027', title:'Broken classroom fan', description:'One ceiling fan is not functioning properly in the ECE classroom.', category:'Classroom', location:'ECE Block', priority:'Medium', status:'Pending', reportedBy:'Neha Verma', department:'General Maintenance', reports:1, photoUrl:null, createdAt:base, updatedAt:base, updates:[{status:'Reported',comment:'Fan issue reported by student.',updatedBy:'Student',createdAt:base}] },
    { id:'CF1028', title:'Damaged classroom chair', description:'A classroom chair has a broken back support and needs replacement.', category:'Furniture', location:'Academic Block', priority:'Low', status:'Verified', reportedBy:'Vikash Kumar', department:'General Maintenance', reports:1, photoUrl:null, createdAt:base, updatedAt:base, updates:[{status:'Reported',comment:'Damaged chair reported.',updatedBy:'Student',createdAt:base},{status:'Verified',comment:'Issue verified by administration.',updatedBy:'CampusFix Admin',createdAt:base}] },
    { id:'CF1029', title:'Washroom sanitation issue', description:'Washroom requires cleaning and maintenance near the academic block.', category:'Sanitation', location:'Academic Block', priority:'Medium', status:'In Progress', reportedBy:'Kunal Sharma', department:'Sanitation', reports:4, photoUrl:null, createdAt:base, updatedAt:base, updates:[{status:'Reported',comment:'Sanitation problem reported.',updatedBy:'Student',createdAt:base},{status:'Assigned',comment:'Assigned to sanitation team.',updatedBy:'CampusFix Admin',createdAt:base},{status:'In Progress',comment:'Cleaning team assigned.',updatedBy:'CampusFix Admin',createdAt:base}] }
  ];
}
let data = readData();
if (!Array.isArray(data.issues) || data.issues.length === 0) { data = { issues: seed() }; writeData(data); }

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

app.get('/api/health', (_, res) => res.json({ ok:true, service:'CampusFix API', version:'1.0' }));

app.get('/api/meta', (_, res) => res.json({ categories, departments, statuses }));

app.get('/api/issues', (req, res) => {
  const { status, category, priority, location, search } = req.query;
  let list = [...data.issues];
  if (status && status !== 'All') list = list.filter(i => i.status === status);
  if (category && category !== 'All') list = list.filter(i => i.category === category);
  if (priority && priority !== 'All') list = list.filter(i => i.priority === priority);
  if (location && location !== 'All') list = list.filter(i => i.location === location);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(i => `${i.id} ${i.title} ${i.description} ${i.location}`.toLowerCase().includes(q));
  }
  res.json(list);
});

app.get('/api/issues/:id', (req, res) => {
  const issue = data.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error:'Issue not found' });
  res.json(issue);
});

app.post('/api/issues', upload.single('photo'), (req, res) => {
  const { title, description, category, location, urgency='Medium', reportedBy='Demo Student' } = req.body;
  if (!title || !description || !category || !location) return res.status(400).json({ error:'title, description, category and location are required' });
  if (!categories.includes(category)) return res.status(400).json({ error:'Invalid category' });
  const duplicate = findDuplicate(data.issues, category, location, description);
  const reports = duplicate ? duplicate.issue.reports + 1 : 1;
  const createdAt = now();
  const issue = {
    id: nextComplaintId(data.issues), title, description, category, location,
    priority: priorityFor(category, urgency, description, reports),
    status:'Pending', reportedBy, department:departmentFor(category), reports,
    photoUrl: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt, updatedAt:createdAt,
    updates:[{status:'Reported',comment:'Issue submitted by student.',updatedBy:'Student',createdAt}]
  };
  data.issues.unshift(issue);
  writeData(data);
  res.status(201).json({ issue, duplicate: duplicate ? { complaintId:duplicate.issue.id, score:duplicate.score } : null });
});

app.patch('/api/issues/:id', (req, res) => {
  const issue = data.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error:'Issue not found' });
  const oldStatus = issue.status;
  const status = req.body.status || oldStatus;
  const department = req.body.department || issue.department;
  const priority = req.body.priority || issue.priority;
  const comment = String(req.body.comment || '').trim();
  if (!statuses.includes(status)) return res.status(400).json({ error:'Invalid status' });
  if (!departments.includes(department)) return res.status(400).json({ error:'Invalid department' });
  issue.status = status;
  issue.department = department;
  issue.priority = priority;
  issue.updatedAt = now();
  if (comment || status !== oldStatus) issue.updates.push({ status, comment: comment || `Status changed to ${status}.`, updatedBy:'CampusFix Admin', createdAt:issue.updatedAt });
  writeData(data);
  res.json(issue);
});

app.delete('/api/issues/:id', (req, res) => {
  const before = data.issues.length;
  data.issues = data.issues.filter(i => i.id !== req.params.id);
  if (data.issues.length === before) return res.status(404).json({ error:'Issue not found' });
  writeData(data);
  res.json({ ok:true });
});

app.get('/api/analytics', (_, res) => {
  const issues = data.issues;
  const total = issues.length;
  const critical = issues.filter(i => i.priority === 'Critical').length;
  const pending = issues.filter(i => i.status === 'Pending').length;
  const inProgress = issues.filter(i => i.status === 'In Progress').length;
  const resolved = issues.filter(i => i.status === 'Resolved').length;
  const categoryMap = {};
  const locationMap = {};
  issues.forEach(i => {
    categoryMap[i.category] = (categoryMap[i.category] || 0) + i.reports;
    locationMap[i.location] = (locationMap[i.location] || 0) + i.reports;
  });
  const categoriesOut = Object.entries(categoryMap).map(([name,count]) => ({name,count})).sort((a,b)=>b.count-a.count);
  const locationsOut = Object.entries(locationMap).map(([name,count]) => ({name,count})).sort((a,b)=>b.count-a.count);
  const recurring = Object.values(issues.reduce((acc,i)=>{
    const key = `${i.location}__${i.category}`;
    if(!acc[key]) acc[key] = { location:i.location, category:i.category, reports:0, issues:0 };
    acc[key].reports += i.reports;
    acc[key].issues += 1;
    return acc;
  },{})).filter(x=>x.reports>1).sort((a,b)=>b.reports-a.reports);
  res.json({ total, critical, pending, inProgress, resolved, categories:categoriesOut, locations:locationsOut, recurring });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error:err.message });
  res.status(500).json({ error:'Internal server error' });
});

app.listen(PORT, () => console.log(`CampusFix API running at http://localhost:${PORT}`));