import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { apiGet } from "../lib/api";
import type { OperatorContext } from "../lib/types";
import "./globals.css";
export const metadata:Metadata={title:"NOLI Vendaz Back Office",description:"Multi-provider vending operations and orchestration control plane"};
export default async function RootLayout({children}:{children:ReactNode}){let operator:OperatorContext|null=null;try{operator=await apiGet<OperatorContext>("/api/v1/auth/context")}catch{operator=null}return <html lang="en"><body>{operator?<AppShell operator={operator}>{children}</AppShell>:<main className="public-page">{children}</main>}</body></html>}
