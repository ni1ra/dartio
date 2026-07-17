import { getNeonAuth } from "@/lib/server/auth";

type Context = { params: Promise<{ path: string[] }> };
export function GET(request: Request, context: Context) { return getNeonAuth().handler().GET(request, context); }
export function POST(request: Request, context: Context) { return getNeonAuth().handler().POST(request, context); }
export function PUT(request: Request, context: Context) { return getNeonAuth().handler().PUT(request, context); }
export function DELETE(request: Request, context: Context) { return getNeonAuth().handler().DELETE(request, context); }
export function PATCH(request: Request, context: Context) { return getNeonAuth().handler().PATCH(request, context); }
