import "./globals.css";import type {Metadata} from "next";
export const metadata:Metadata={title:"SRouter",description:"Simple personal AI router"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="id" suppressHydrationWarning><body>{children}</body></html>}
