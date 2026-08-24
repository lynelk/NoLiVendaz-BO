import { NextResponse,type NextRequest } from "next/server";
export async function GET(request:NextRequest){const r=NextResponse.redirect(new URL("/login",request.url));r.cookies.delete("nolivendaz_access_token");return r;}
