import React,{useState} from 'react'
import axios from 'axios'
import Chatbot from './components/Chatbot';
export default function App(){
  const[q,setQ]=useState(''); const[msg,setMsg]=useState([]);
  const ask=async()=>{
    const r=await axios.post('http://localhost:4000/api/query',{question:q});
    setMsg(m=>[...m,{from:'user',text:q},{from:'bot',text:r.data.answer}]); setQ('');
  };
  return (<div> <Chatbot apiUrl="/api/query" /></div>);
}