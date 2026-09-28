/**
 * Bağımlılıksız QR SVG üretici.
 * Portal QR bağlantıları için sabit QR Model 2 Version 6-L kullanır.
 * Version 6-L: 41x41 modül, 136 veri codeword, 2x18 ECC codeword.
 * URL 134 UTF-8 byte'ı aşarsa açık hata verir; PORTAL_PUBLIC_URL kısa/tanımlı tutulmalıdır.
 */

const VERSION = 6;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 136;
const BLOCK_DATA = 68;
const ECC_CODEWORDS = 18;
const MAX_BYTE_LENGTH = 134;

const EXP = new Array<number>(512).fill(0);
const LOG = new Array<number>(256).fill(0);
(function initGalois(){
  let x=1;
  for(let i=0;i<255;i++){
    EXP[i]=x; LOG[x]=i;
    x <<= 1;
    if(x & 0x100) x ^= 0x11d;
  }
  for(let i=255;i<512;i++) EXP[i]=EXP[i-255];
})();

function gfMul(a:number,b:number){
  if(a===0||b===0)return 0;
  return EXP[LOG[a]+LOG[b]];
}

function polyMul(a:number[],b:number[]){
  const out=new Array(a.length+b.length-1).fill(0);
  for(let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) out[i+j]^=gfMul(a[i],b[j]);
  return out;
}

function generator(degree:number){
  let g=[1];
  for(let i=0;i<degree;i++) g=polyMul(g,[1,EXP[i]]);
  return g;
}

const RS_GENERATOR=generator(ECC_CODEWORDS);

function rsEncode(data:number[]){
  const work=data.concat(new Array(ECC_CODEWORDS).fill(0));
  for(let i=0;i<data.length;i++){
    const factor=work[i];
    if(factor===0)continue;
    for(let j=0;j<RS_GENERATOR.length;j++) work[i+j]^=gfMul(RS_GENERATOR[j],factor);
  }
  return work.slice(data.length);
}

class BitBuffer{
  bytes:number[]=[];
  length=0;
  put(value:number,length:number){for(let i=length-1;i>=0;i--)this.putBit(((value>>>i)&1)===1)}
  putBit(bit:boolean){const index=Math.floor(this.length/8);if(this.bytes.length<=index)this.bytes.push(0);if(bit)this.bytes[index]|=0x80>>>(this.length%8);this.length++}
}

function dataCodewords(text:string){
  const bytes=Array.from(new TextEncoder().encode(text));
  if(bytes.length>MAX_BYTE_LENGTH)throw new Error(`QR bağlantısı çok uzun (${bytes.length} byte). PORTAL_PUBLIC_URL daha kısa bir alan adı olmalıdır.`);
  const bits=new BitBuffer();
  bits.put(0b0100,4); // byte mode
  bits.put(bytes.length,8); // version 1-9 byte count
  for(const b of bytes)bits.put(b,8);
  const capacity=DATA_CODEWORDS*8;
  const terminator=Math.min(4,capacity-bits.length);
  bits.put(0,terminator);
  while(bits.length%8!==0)bits.putBit(false);
  let pad=0;
  while(bits.bytes.length<DATA_CODEWORDS){bits.bytes.push(pad%2===0?0xec:0x11);pad++}
  return bits.bytes.slice(0,DATA_CODEWORDS);
}

function finalCodewords(text:string){
  const data=dataCodewords(text);
  const blocks=[data.slice(0,BLOCK_DATA),data.slice(BLOCK_DATA,BLOCK_DATA*2)];
  const ecc=blocks.map(rsEncode);
  const out:number[]=[];
  for(let i=0;i<BLOCK_DATA;i++)for(const b of blocks)out.push(b[i]);
  for(let i=0;i<ECC_CODEWORDS;i++)for(const b of ecc)out.push(b[i]);
  return out;
}

function bchTypeInfo(data:number){
  let d=data<<10;
  const g=0x537;
  const digit=(n:number)=>{let x=n,r=0;while(x!==0){r++;x>>>=1}return r};
  while(digit(d)-digit(g)>=0)d^=g<<(digit(d)-digit(g));
  return ((data<<10)|d)^0x5412;
}

function createMatrix(text:string){
  const modules:(boolean|null)[][]=Array.from({length:SIZE},()=>Array<boolean|null>(SIZE).fill(null));
  const set=(r:number,c:number,v:boolean)=>{if(r>=0&&r<SIZE&&c>=0&&c<SIZE)modules[r][c]=v};
  const finder=(row:number,col:number)=>{
    for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){
      const rr=row+r,cc=col+c;if(rr<0||rr>=SIZE||cc<0||cc>=SIZE)continue;
      const dark=r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));
      set(rr,cc,dark);
    }
  };
  finder(0,0); finder(SIZE-7,0); finder(0,SIZE-7);

  // Timing patterns
  for(let i=8;i<SIZE-8;i++){
    if(modules[i][6]===null)set(i,6,i%2===0);
    if(modules[6][i]===null)set(6,i,i%2===0);
  }

  // Version 6 alignment pattern centers: 6, 34. Finder bölgeleri atlanır.
  const centers=[6,34];
  for(const row of centers)for(const col of centers){
    if(modules[row][col]!==null)continue;
    for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++) set(row+r,col+c,Math.max(Math.abs(r),Math.abs(c))!==1);
  }

  // Format info: EC level L (01), mask 0.
  const format=bchTypeInfo((1<<3)|0);
  for(let i=0;i<15;i++){
    const dark=((format>>>i)&1)===1;
    if(i<6)set(i,8,dark);else if(i<8)set(i+1,8,dark);else set(SIZE-15+i,8,dark);
    if(i<8)set(8,SIZE-i-1,dark);else if(i<9)set(8,15-i,dark);else set(8,15-i-1,dark);
  }
  set(SIZE-8,8,true); // fixed dark module

  const codewords=finalCodewords(text);
  let byteIndex=0,bitIndex=7,row=SIZE-1,inc=-1;
  for(let col=SIZE-1;col>0;col-=2){
    if(col===6)col--;
    while(true){
      for(let c=0;c<2;c++){
        const cc=col-c;
        if(modules[row][cc]!==null)continue;
        let dark=false;
        if(byteIndex<codewords.length)dark=((codewords[byteIndex]>>>bitIndex)&1)===1;
        // mask pattern 0
        if((row+cc)%2===0)dark=!dark;
        set(row,cc,dark);
        bitIndex--;
        if(bitIndex<0){byteIndex++;bitIndex=7}
      }
      row+=inc;
      if(row<0||row>=SIZE){row-=inc;inc=-inc;break}
    }
  }
  return modules as boolean[][];
}

export function qrSvg(text:string,options?:{scale?:number;quiet?:number}){
  const scale=Math.max(2,Math.floor(options?.scale??8));
  const quiet=Math.max(4,Math.floor(options?.quiet??4));
  const matrix=createMatrix(text);
  const total=SIZE+quiet*2;
  let path="";
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(matrix[r][c])path+=`M${c+quiet} ${r+quiet}h1v1h-1z`;
  const px=total*scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
