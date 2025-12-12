/* server/vectorStore.js - TF-IDF retriever */
function tokenize(text){
  return (text||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean);
}
function cosineSparse(a,b){
  const [small,big] = Object.keys(a).length < Object.keys(b).length ? [a,b] : [b,a];
  let dot=0;
  for(const k of Object.keys(small)){ if(big[k]) dot += small[k]*big[k]; }
  let na=0, nb=0;
  for(const v of Object.values(a)) na+=v*v;
  for(const v of Object.values(b)) nb+=v*v;
  return dot/(Math.sqrt(na)*Math.sqrt(nb)+1e-12);
}
export function cosineSearch(queryText, db, topK=3){
  if(!Array.isArray(db) || db.length===0) return [];
  const qTokens = tokenize(queryText);
  const qtf = {};
  for(const t of qTokens) qtf[t] = (qtf[t]||0)+1;
  for(const k of Object.keys(qtf)) qtf[k] = qtf[k]/qTokens.length;
  const idfAcc = {}; let idfCount=0;
  for(const item of db){ if(!item.idf) continue; idfCount++; for(const [tok,v] of Object.entries(item.idf)) idfAcc[tok]=(idfAcc[tok]||0)+v; }
  const idf = {};
  if(idfCount>0){ for(const [k,v] of Object.entries(idfAcc)) idf[k]=v/idfCount; }
  const qvec = {};
  for(const [tok,tf] of Object.entries(qtf)){ const idfv = idf[tok] ?? Math.log(1+db.length); qvec[tok]=tf*idfv; }
  const scored = db.map(item => ({ ...item, score: cosineSparse(qvec, item.tfidf || {}) }));
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0, topK);
}
