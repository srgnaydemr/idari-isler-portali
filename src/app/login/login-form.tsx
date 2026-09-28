"use client";
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";

export function LoginForm({error}:{error?:string}) {
  const [showPassword,setShowPassword]=useState(false);
  return <form className="login-form" action="/api/login" method="post">
    {error ? <div className="error-box" role="alert">{error}</div> : null}
    <div className="field"><label htmlFor="identifier">E-posta veya Kullanıcı Adı</label><div className="login-input-wrap"><UserRound size={18}/><input id="identifier" className="input" name="identifier" autoComplete="username" placeholder="kullaniciadi veya ad@firma.com" required autoFocus /></div></div>
    <div className="field"><label htmlFor="password">Şifre</label><div className="login-input-wrap"><LockKeyhole size={18}/><input id="password" className="input" type={showPassword?"text":"password"} name="password" autoComplete="current-password" placeholder="Şifrenizi girin" required /><button type="button" className="password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Şifreyi gizle":"Şifreyi göster"}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
    <button className="btn btn-primary login-submit" type="submit">Giriş Yap</button>
  </form>;
}
