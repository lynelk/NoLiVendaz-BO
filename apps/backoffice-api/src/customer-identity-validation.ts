export function isSafeIdentityMask(value:string):boolean{
  const mask=value.trim().toUpperCase();
  if(mask.length<4||mask.length>64)return false;
  if(!/^[A-Z0-9*•]+$/.test(mask))return false;
  const maskedCharacters=(mask.match(/[*•]/g)??[]).length;
  const visibleCharacters=mask.replace(/[*•]/g,"");
  return maskedCharacters>=2&&visibleCharacters.length>=1&&visibleCharacters.length<=4;
}
