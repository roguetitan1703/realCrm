// ============================================================================
// Bhumi Realestate! CRM — seed data store (demo, local/in-memory).
// All Pune, all internally consistent: every property has an owner,
// every lead requirement matches >=2 properties so matching always demos.
// Data shapes here are the production shapes.
// ============================================================================

export const agents = [
  { id: "a1", name: "Rohan Deshmukh", first: "Rohan", initials: "RD", color: "#2E7D4E" },
  { id: "a2", name: "Sneha Kulkarni", first: "Sneha", initials: "SK", color: "#3A7CA5" },
  { id: "a3", name: "Amit Jain",      first: "Amit",  initials: "AJ", color: "#C2551F" },
  { id: "a4", name: "Priya Sharma",   first: "Priya", initials: "PS", color: "#8A5350" },
];

// --- Properties (~14) -------------------------------------------------------
// price is a number in rupees; priceLabel is the Indian-formatted display.
export const properties = [
  { id:"p1", title:"2 BHK · Wakad", type:"2BHK", deal:"sale", locality:"Wakad", society:"Kolte Patil Life Republic",
    carpet:950, floor:4, totalFloors:12, facing:"East", age:6, price:8200000, priceLabel:"₹82L", negotiable:true, status:"Available", owner:"Sunil Agarwal",
    furnishing:"Semi-furnished", possession:"Immediate",
    features:["Pool, gym & clubhouse","Covered parking","Hinjewadi IT park 15 min","Schools & market walkable"] },
  { id:"p2", title:"2 BHK · Wakad", type:"2BHK", deal:"sale", locality:"Wakad", society:"Rohan Abhilasha",
    carpet:1020, floor:7, totalFloors:14, facing:"North", age:3, price:8800000, priceLabel:"₹88L", negotiable:true, status:"Available", owner:"Meena Joshi",
    furnishing:"Unfurnished", possession:"Immediate",
    features:["Corner flat, extra ventilation","2 covered parkings","Kids play area + garden","5 min to Hinjewadi Phase 1"] },
  { id:"p3", title:"3 BHK · Baner", type:"3BHK", deal:"sale", locality:"Baner", society:"Gera Emerald",
    carpet:1450, floor:9, totalFloors:18, facing:"West", age:5, price:16500000, priceLabel:"₹1.65Cr", negotiable:true, status:"Available", owner:"Rajesh Malhotra",
    furnishing:"Semi-furnished", possession:"Immediate",
    features:["Hill view, high floor","Modular kitchen","Clubhouse + infinity pool","Balewadi High Street 8 min"] },
  { id:"p4", title:"3 BHK · Kalyani Nagar", type:"3BHK", deal:"sale", locality:"Kalyani Nagar", society:"Marvel Fria",
    carpet:1620, floor:11, totalFloors:20, facing:"East", age:4, price:21000000, priceLabel:"₹2.1Cr", negotiable:false, status:"Under offer", owner:"Farida Contractor",
    furnishing:"Fully furnished", possession:"Immediate",
    features:["Riverside facing","Italian marble flooring","Concierge + valet","Prime Kalyani Nagar location"] },
  { id:"p5", title:"2 BHK · Kothrud", type:"2BHK", deal:"sale", locality:"Kothrud", society:"Paranjape Athashri",
    carpet:1080, floor:5, totalFloors:10, facing:"South", age:8, price:11500000, priceLabel:"₹1.15Cr", negotiable:true, status:"Available", owner:"Vikram Deshpande",
    furnishing:"Semi-furnished", possession:"After 2 months",
    features:["Established society","Temple & market next door","Metro station 10 min","Reserved parking"] },
  { id:"p6", title:"1 BHK · Hinjewadi", type:"1BHK", deal:"sale", locality:"Hinjewadi", society:"Megapolis Sunway",
    carpet:620, floor:3, totalFloors:22, facing:"North", age:5, price:5500000, priceLabel:"₹55L", negotiable:true, status:"Available", owner:"Anil Kumar",
    furnishing:"Semi-furnished", possession:"Immediate",
    features:["Walk to Phase 1 IT park","Township with mall","Ideal first home / rental","24x7 shuttle"] },
  { id:"p7", title:"3 BHK Furnished · Kothrud", type:"3BHK", deal:"rent", locality:"Kothrud", society:"Shivtirth Nagar",
    carpet:1350, floor:2, totalFloors:7, facing:"East", age:9, price:50000, priceLabel:"₹50,000/mo", deposit:100000, depositLabel:"₹1,00,000", negotiable:false, status:"Available", owner:"Ajinkya Patil",
    furnishing:"Fully furnished", possession:"1 July", tenants:"Family / bachelors",
    features:["Modular kitchen with trolleys","Beds, mattresses & wardrobes","Sofa, TV unit, shoe rack","Fridge, microwave, stove, washing machine, geyser","Gas pipeline + free cable","Big garden attached"], billsByOwner:true },
  { id:"p8", title:"2 BHK · Viman Nagar", type:"2BHK", deal:"rent", locality:"Viman Nagar", society:"Nyati Emporius",
    carpet:900, floor:6, totalFloors:13, facing:"West", age:6, price:32000, priceLabel:"₹32,000/mo", deposit:200000, depositLabel:"₹2,00,000", negotiable:true, status:"Available", owner:"Deepak Nair",
    furnishing:"Semi-furnished", possession:"Immediate", tenants:"Family preferred",
    features:["Airport 10 min","Phoenix Marketcity 5 min","Wardrobes + kitchen fitted","Gated, covered parking"] },
  { id:"p9", title:"2 BHK · Viman Nagar", type:"2BHK", deal:"sale", locality:"Viman Nagar", society:"Konark Campus",
    carpet:980, floor:8, totalFloors:15, facing:"East", age:7, price:9200000, priceLabel:"₹92L", negotiable:true, status:"Available", owner:"Sanjana Rao",
    furnishing:"Semi-furnished", possession:"Immediate",
    features:["Close to airport & IT hubs","Gym + jogging track","Reputed schools nearby","Covered parking"] },
  { id:"p10", title:"3 BHK · Baner", type:"3BHK", deal:"sale", locality:"Baner", society:"Kumar Prospera",
    carpet:1520, floor:6, totalFloors:16, facing:"North-East", age:6, price:17800000, priceLabel:"₹1.78Cr", negotiable:true, status:"Available", owner:"Harish Bhatt",
    furnishing:"Semi-furnished", possession:"Immediate",
    features:["Spacious 3-side open","Vaastu compliant","Clubhouse + sports courts","Balewadi & Baner both close"] },
  { id:"p11", title:"Office · Hinjewadi", type:"Commercial", deal:"sale", locality:"Hinjewadi", society:"Blue Ridge SEZ",
    carpet:1200, floor:4, totalFloors:10, facing:"—", age:7, price:13500000, priceLabel:"₹1.35Cr", negotiable:true, status:"Available", owner:"Techlink Ventures",
    furnishing:"Bare shell", possession:"Immediate",
    features:["Inside IT SEZ","Ready fit-out possible","Ample parking","High footfall corridor"] },
  { id:"p12", title:"NA Plot · Wagholi", type:"Plot", deal:"sale", locality:"Wagholi", society:"Balaji Greens",
    carpet:2400, floor:0, totalFloors:0, facing:"East", age:0, price:9500000, priceLabel:"₹95L", negotiable:true, status:"Available", owner:"Balaji Land Holdings",
    furnishing:"—", possession:"Immediate",
    features:["Clear title, NA sanctioned","Gated plotted layout","Nagar Road connectivity","Ideal bungalow / investment"] },
  { id:"p13", title:"2 BHK · Wakad", type:"2BHK", deal:"sale", locality:"Wakad", society:"Pristine Prolife",
    carpet:1010, floor:9, totalFloors:13, facing:"West", age:2, price:8500000, priceLabel:"₹85L", negotiable:true, status:"Available", owner:"Nitin Shah",
    furnishing:"Semi-furnished", possession:"Immediate",
    features:["Almost new, 2 yrs old","Rooftop amenities","Wakad-Hinjewadi border","Great rental yield"] },
  { id:"p14", title:"1 BHK · Hinjewadi", type:"1BHK", deal:"rent", locality:"Hinjewadi", society:"Life Republic",
    carpet:580, floor:5, totalFloors:18, facing:"South", age:4, price:18000, priceLabel:"₹18,000/mo", deposit:90000, depositLabel:"₹90,000", negotiable:true, status:"Available", owner:"Pooja Menon",
    furnishing:"Semi-furnished", possession:"Immediate", tenants:"Bachelors OK",
    features:["Township, walk to IT park","Semi-furnished, ready to move","Shuttle + mall inside","Low deposit"] },
];

// --- Leads (~15) ------------------------------------------------------------
// req.budgetMin/Max in rupees. minsAgo drives the time-ago label + sort.
export const leads = [
  { id:"l1", name:"Karan Mehta", phone:"+91 98220 41556", source:"99acres", stage:"New", minsAgo:2, agentId:null,
    req:{ config:"2BHK", deal:"sale", locality:"Wakad", budgetMin:7500000, budgetMax:8500000, timeline:"Within 1 month", notes:"Ready-possession only, first floor+." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Lead created via 99acres", ago:"2 min ago"} ] },
  { id:"l2", name:"Aarti Deshpande", phone:"+91 99700 33218", source:"MagicBricks", stage:"Contacted", minsAgo:2880, agentId:"a2",
    req:{ config:"3BHK", deal:"sale", locality:"Baner", budgetMin:15000000, budgetMax:18000000, timeline:"2–3 months", notes:"High floor, hill view preferred." },
    overdue:true, followUp:{ action:"Call back — share Baner options", date:"Yesterday", time:"5:00 pm" },
    timeline:[ {type:"created", label:"Lead created via MagicBricks", ago:"2 days ago"}, {type:"stage", label:"Stage → Contacted", ago:"2 days ago"}, {type:"note", label:"Spoke on call, wants Gera Emerald / Kumar Prospera", ago:"2 days ago"} ] },
  { id:"l3", name:"Imran Shaikh", phone:"+91 90280 77190", source:"Walk-in", stage:"Site Visit", minsAgo:1440, agentId:"a1",
    req:{ config:"2BHK", deal:"sale", locality:"Viman Nagar", budgetMin:8500000, budgetMax:9500000, timeline:"1–2 months", notes:"East facing, near airport." },
    overdue:false, followUp:{ action:"Site visit — Konark Campus", date:"Sat", time:"11:00 am" },
    timeline:[ {type:"created", label:"Walk-in enquiry logged", ago:"1 day ago"}, {type:"stage", label:"Stage → Site Visit", ago:"6 hrs ago"}, {type:"msg", label:"WhatsApp sent — Konark Campus", ago:"5 hrs ago"} ] },
  { id:"l4", name:"Neha Kulkarni", phone:"+91 98505 61023", source:"Referral", stage:"New", minsAgo:180, agentId:"a3",
    req:{ config:"3BHK", deal:"rent", locality:"Kothrud", budgetMin:45000, budgetMax:55000, timeline:"Immediate", notes:"Fully furnished, family." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Referred by Ajinkya Patil", ago:"3 hrs ago"} ] },
  { id:"l5", name:"Sanjay Pawar", phone:"+91 97640 20087", source:"Website", stage:"Negotiation", minsAgo:4320, agentId:"a4",
    req:{ config:"2BHK", deal:"sale", locality:"Kothrud", budgetMin:10000000, budgetMax:12000000, timeline:"Ready to close", notes:"Established society, parking a must." },
    overdue:false, followUp:{ action:"Finalise price — Paranjape Athashri", date:"Mon", time:"12:30 pm" },
    timeline:[ {type:"created", label:"Website enquiry", ago:"3 days ago"}, {type:"stage", label:"Stage → Negotiation", ago:"1 day ago"}, {type:"note", label:"Offered ₹1.10Cr, owner at ₹1.15Cr", ago:"1 day ago"} ] },
  { id:"l6", name:"Ritu Agarwal", phone:"+91 99219 84450", source:"99acres", stage:"Contacted", minsAgo:2160, agentId:"a1",
    req:{ config:"1BHK", deal:"sale", locality:"Hinjewadi", budgetMin:5000000, budgetMax:5800000, timeline:"1 month", notes:"Investment, near IT park." },
    overdue:true, followUp:{ action:"Send Megapolis details", date:"Yesterday", time:"11:00 am" },
    timeline:[ {type:"created", label:"Lead created via 99acres", ago:"36 hrs ago"}, {type:"stage", label:"Stage → Contacted", ago:"1 day ago"} ] },
  { id:"l7", name:"Deepak Verma", phone:"+91 98230 55471", source:"MagicBricks", stage:"New", minsAgo:95, agentId:null,
    req:{ config:"2BHK", deal:"rent", locality:"Viman Nagar", budgetMin:30000, budgetMax:35000, timeline:"Immediate", notes:"Family, semi-furnished fine." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Lead created via MagicBricks", ago:"1 hr ago"} ] },
  { id:"l8", name:"Kavita Rao", phone:"+91 90110 23388", source:"Referral", stage:"Closed Won", minsAgo:10080, agentId:"a2",
    req:{ config:"3BHK", deal:"sale", locality:"Kalyani Nagar", budgetMin:19000000, budgetMax:22000000, timeline:"Done", notes:"Premium, riverside." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Referral lead", ago:"1 week ago"}, {type:"stage", label:"Stage → Closed Won", ago:"2 days ago"}, {type:"note", label:"Marvel Fria booked at ₹2.1Cr", ago:"2 days ago"} ] },
  { id:"l9", name:"Amol Jadhav", phone:"+91 97300 41902", source:"Walk-in", stage:"Site Visit", minsAgo:2600, agentId:"a3",
    req:{ config:"2BHK", deal:"sale", locality:"Wakad", budgetMin:8000000, budgetMax:9000000, timeline:"1–2 months", notes:"Newer construction preferred." },
    overdue:false, followUp:{ action:"Site visit — Pristine Prolife", date:"Sun", time:"10:30 am" },
    timeline:[ {type:"created", label:"Walk-in enquiry", ago:"2 days ago"} ] },
  { id:"l10", name:"Karan Mehta", phone:"+91 98220 41556", source:"Website", stage:"New", minsAgo:1200, agentId:null,
    req:{ config:"2BHK", deal:"sale", locality:"Wakad", budgetMin:7500000, budgetMax:8500000, timeline:"1 month", notes:"Duplicate — same number as 99acres lead." },
    overdue:false, followUp:null, duplicateOf:"l1",
    timeline:[ {type:"created", label:"Website enquiry", ago:"20 hrs ago"} ] },
  { id:"l11", name:"Farhan Qureshi", phone:"+91 99600 71235", source:"99acres", stage:"Contacted", minsAgo:5000, agentId:"a4",
    req:{ config:"3BHK", deal:"sale", locality:"Baner", budgetMin:16000000, budgetMax:19000000, timeline:"2 months", notes:"Vaastu, 3-side open." },
    overdue:false, followUp:{ action:"Share Kumar Prospera plan", date:"Tue", time:"4:00 pm" },
    timeline:[ {type:"created", label:"Lead created via 99acres", ago:"3 days ago"}, {type:"stage", label:"Stage → Contacted", ago:"2 days ago"} ] },
  { id:"l12", name:"Shweta Naik", phone:"+91 90960 33810", source:"Website", stage:"New", minsAgo:240, agentId:null,
    req:{ config:"1BHK", deal:"rent", locality:"Hinjewadi", budgetMin:15000, budgetMax:20000, timeline:"Immediate", notes:"Single working professional." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Website enquiry", ago:"4 hrs ago"} ] },
  { id:"l13", name:"Prakash Iyer", phone:"+91 98901 20740", source:"Referral", stage:"Negotiation", minsAgo:6000, agentId:"a1",
    req:{ config:"Commercial", deal:"sale", locality:"Hinjewadi", budgetMin:12000000, budgetMax:14000000, timeline:"1 month", notes:"Office for own IT firm." },
    overdue:false, followUp:{ action:"Draft deal — Blue Ridge office", date:"Wed", time:"3:00 pm" },
    timeline:[ {type:"created", label:"Referral lead", ago:"4 days ago"}, {type:"stage", label:"Stage → Negotiation", ago:"1 day ago"} ] },
  { id:"l14", name:"Manish Gupta", phone:"+91 97120 88345", source:"MagicBricks", stage:"Closed Lost", minsAgo:12000, agentId:"a3",
    req:{ config:"Plot", deal:"sale", locality:"Wagholi", budgetMin:9000000, budgetMax:10000000, timeline:"Dropped", notes:"Went with another broker." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Lead created via MagicBricks", ago:"1 week ago"}, {type:"stage", label:"Stage → Closed Lost", ago:"3 days ago"} ] },
  { id:"l15", name:"Sunita Kale", phone:"+91 98600 47712", source:"Walk-in", stage:"Contacted", minsAgo:2300, agentId:"a2",
    req:{ config:"2BHK", deal:"sale", locality:"Kothrud", budgetMin:10000000, budgetMax:11500000, timeline:"2 months", notes:"Ground/low floor for parents." },
    overdue:true, followUp:{ action:"Callback — Athashri availability", date:"Yesterday", time:"6:30 pm" },
    timeline:[ {type:"created", label:"Walk-in enquiry", ago:"38 hrs ago"}, {type:"stage", label:"Stage → Contacted", ago:"1 day ago"} ] },
  { id:"l16", name:"Rahul Kolte", phone:"+91 98220 63914", source:"Referral", stage:"Closed Won", minsAgo:8600, agentId:"a1",
    req:{ config:"2BHK", deal:"sale", locality:"Wakad", budgetMin:8000000, budgetMax:8800000, timeline:"Done", notes:"Booked, registration pending." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Referral lead", ago:"6 days ago"}, {type:"stage", label:"Stage → Closed Won", ago:"3 days ago"}, {type:"note", label:"Pristine Prolife booked at ₹85L", ago:"3 days ago"} ] },
  { id:"l17", name:"Vaishali Patil", phone:"+91 99700 51288", source:"99acres", stage:"Closed Won", minsAgo:9800, agentId:"a2",
    req:{ config:"2BHK", deal:"sale", locality:"Kothrud", budgetMin:10000000, budgetMax:11500000, timeline:"Done", notes:"Athashri deal closed." },
    overdue:false, followUp:null,
    timeline:[ {type:"created", label:"Lead created via 99acres", ago:"1 week ago"}, {type:"stage", label:"Stage → Closed Won", ago:"4 days ago"} ] },
  { id:"l18", name:"Ganesh More", phone:"+91 90280 33471", source:"Website", stage:"Contacted", minsAgo:520, agentId:"a3",
    req:{ config:"1BHK", deal:"rent", locality:"Hinjewadi", budgetMin:15000, budgetMax:20000, timeline:"This week", notes:"IT professional, immediate move." },
    overdue:false, followUp:{ action:"Share Life Republic 1BHK", date:"Today", time:"7:00 pm" },
    timeline:[ {type:"created", label:"Website enquiry", ago:"9 hrs ago"}, {type:"stage", label:"Stage → Contacted", ago:"7 hrs ago"} ] },
];

export const STAGES = ["New","Contacted","Site Visit","Negotiation","Closed Won","Closed Lost"];

// --- Matching ---------------------------------------------------------------
// Template-composed fit lines (previews future AI matching, no claim).
export function matchesForLead(lead) {
  const r = lead.req;
  const scored = properties
    .filter(p => p.deal === r.deal && p.type === r.config && p.status !== "Closed")
    .map(p => {
      let score = 0; const fit = [];
      if (p.locality === r.locality) { score += 3; fit.push(r.locality); }
      const inBudget = p.price >= r.budgetMin * 0.95 && p.price <= r.budgetMax * 1.08;
      if (inBudget) { score += 3; fit.push("in budget"); }
      else if (p.price < r.budgetMin) { score += 1; fit.push("under budget"); }
      if (p.status === "Available") score += 1;
      if (p.possession === "Immediate") fit.push("ready to move");
      return { ...p, _score: score, fitLine: fit.slice(0,3).join(" · ") };
    })
    .filter(p => p._score >= 3)
    .sort((a,b) => b._score - a._score);
  return scored.slice(0, 4);
}

// Reverse match (F9): which buyers/tenants want THIS property. Pass live leads.
export function leadsForProperty(property, leads) {
  const scored = leads
    .filter(l => l.req.deal === property.deal && l.req.config === property.type && !l.stage.startsWith("Closed"))
    .map(l => {
      let score = 0; const fit = [];
      if (l.req.locality === property.locality) { score += 3; fit.push(l.req.locality); }
      const inBudget = property.price >= l.req.budgetMin * 0.95 && property.price <= l.req.budgetMax * 1.08;
      if (inBudget) { score += 3; fit.push("budget fits"); }
      else if (property.price < l.req.budgetMin) { score += 1; fit.push("under their budget"); }
      return { lead: l, _score: score, fitLine: fit.slice(0, 2).join(" · ") };
    })
    .filter(x => x._score >= 3)
    .sort((a, b) => b._score - a._score);
  return scored.slice(0, 4);
}

// --- WhatsApp message generation -------------------------------------------
// Detailed Pune broker-circular style. Clean: *bold*, • and ✓ markers, no emoji spam.
// Works for both sale and rent. 3 rotating variants; lang + tone toggles.
function inr(p) { return p.priceLabel; }

function buildSale(p, opener, closer) {
  const lines = [];
  lines.push(`*${p.type} for Sale — ${p.locality}*`);
  lines.push(p.society);
  lines.push("");
  lines.push(opener);
  lines.push(`• ${p.carpet} sqft carpet · ${p.floor}${p.floor===1?"st":p.floor===2?"nd":p.floor===3?"rd":"th"} floor · ${p.facing} facing`);
  lines.push(`• ${p.age} yrs old · ${p.furnishing.toLowerCase()} · possession ${p.possession.toLowerCase()}`);
  lines.push("");
  lines.push("Highlights:");
  p.features.forEach(f => lines.push(`✓ ${f}`));
  lines.push("");
  lines.push(`Price: *${inr(p)}*${p.negotiable ? " (thoda negotiable)" : " — fixed"}`);
  lines.push("Owner direct deal, no chain.");
  lines.push(closer);
  lines.push("— Bhumi Realestate!");
  return lines.join("\n");
}

function buildRent(p, opener, closer) {
  const lines = [];
  lines.push(`*${p.type} ${p.furnishing} — On Rent*`);
  lines.push(`${p.society}, ${p.locality}`);
  lines.push("");
  lines.push(opener);
  lines.push(`• ${p.carpet} sqft · ${p.floor}${p.floor===1?"st":p.floor===2?"nd":p.floor===3?"rd":"th"} floor · ${p.facing} facing`);
  lines.push(`• ${p.tenants || "Family"} · possession ${p.possession}`);
  lines.push("");
  lines.push(`${p.furnishing}:`);
  p.features.forEach(f => lines.push(`✓ ${f}`));
  if (p.billsByOwner) { lines.push(""); lines.push("Owner electricity & gas bill pay karega."); }
  lines.push("");
  lines.push(`Rent: *${inr(p)}* · Deposit: *${p.depositLabel}*`);
  lines.push(closer);
  lines.push("— Bhumi Realestate!");
  return lines.join("\n");
}

const HINGLISH = {
  openers: [
    "Bahut hi prime location mein available:",
    "Shifting-ready flat, seedha owner se:",
    "Genuine deal, market se best price:",
  ],
  closers: [
    "Site visit ke liye reply karein — weekend slots open hain.",
    "Interested ho toh reply karein, aaj hi visit fix kar dete hain.",
    "Details ya visit ke liye message karein, turant arrange ho jayega.",
  ],
};
const ENGLISH = {
  openers: [ "Available in a prime location:", "Move-in ready, directly from owner:", "Genuine deal at the best market price:" ],
  closers: [ "Reply to book a site visit — weekend slots open.", "Interested? Reply and we'll fix a visit today.", "Message for details or a visit, arranged right away." ],
};
const MARATHI = {
  openers: [ "अतिशय उत्तम ठिकाणी उपलब्ध:", "राहायला तयार फ्लॅट, थेट मालकाकडून:", "प्रामाणिक व्यवहार, बाजारातील सर्वोत्तम किंमत:" ],
  closers: [ "साइट व्हिजिटसाठी रिप्लाय करा — वीकेंड स्लॉट उपलब्ध.", "इच्छुक असाल तर रिप्लाय करा, आजच व्हिजिट ठरवू.", "अधिक माहिती किंवा व्हिजिटसाठी मेसेज करा." ],
};

export function generateMessage(property, { lang = "Hinglish", tone = "Standard", variant = 0 } = {}) {
  const pack = lang === "English" ? ENGLISH : lang === "Marathi" ? MARATHI : HINGLISH;
  const i = ((variant % 3) + 3) % 3;
  const opener = pack.openers[i];
  const closer = pack.closers[i];
  let msg = property.deal === "rent" ? buildRent(property, opener, closer) : buildSale(property, opener, closer);
  if (tone === "Short") {
    // Condense: headline + price + one closer, drop the feature checklist.
    const L = msg.split("\n");
    const head = L.slice(0, 3);
    const priceLine = L.find(x => x.startsWith("Rent:") || x.startsWith("Price:"));
    msg = [...head, "", opener, priceLine, closer, "— Bhumi Realestate!"].join("\n");
  }
  return msg;
}

export default { agents, properties, leads, STAGES, matchesForLead, generateMessage };
