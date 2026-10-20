import { NextResponse } from 'next/server';
export function errorResponse(error:unknown,status=400){
 const dbError=!!error&&typeof error==='object'&&('code' in error||'severity' in error||('name' in error&&(error as {name?:string}).name==='NeonDbError'));
 if(dbError){console.error('Database request failed:',error);return NextResponse.json({error:'The request could not be completed. Please try again.'},{status:500})}
 const message=error instanceof Error?error.message:'Unexpected server error';
 return NextResponse.json({error:message},{status});
}
