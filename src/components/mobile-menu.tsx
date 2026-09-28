"use client";
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
export function MobileMenu() {
 const [open,setOpen]=useState(false),path=usePathname(),button=useRef<HTMLButtonElement>(null);
 useEffect(()=>setOpen(false),[path]);
 useEffect(()=>{
  const cls='portal-menu-open';document.body.classList.toggle(cls,open);
  const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}};
  const click=(e:MouseEvent)=>{if((e.target as HTMLElement).closest('.sidebar a'))setOpen(false);};
  document.addEventListener('keydown',close);document.addEventListener('click',click);
  return()=>{document.body.classList.remove(cls);document.removeEventListener('keydown',close);document.removeEventListener('click',click);};
 },[open]);
 return <><button ref={button} className="btn btn-secondary mobile-menu-button" type="button" aria-label={open?'Menüyü kapat':'Menüyü aç'} aria-expanded={open} aria-controls="portal-navigation" onClick={()=>setOpen(!open)}>{open?'✕':'☰'}</button>{open&&<button type="button" className="menu-backdrop" aria-label="Menüyü kapat" onClick={()=>setOpen(false)}/>}</>;
}
