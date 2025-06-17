import { NextRequest, NextResponse } from 'next/server';

const EXTERNAL_API_BASE = process.env.LEADS_API_BASE_URL || 'https://api.leads-magician.com/api';
const API_VERSION = process.env.LEADS_API_VERSION || 'v1';
const API_SECRET_KEY = process.env.API_SECRET_KEY;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    

    const industryId = searchParams.get('industryId');
    const timeframe = searchParams.get('timeframe');
    const zipCodes = searchParams.get('zipCodes');


    const externalUrl = new URL(`${EXTERNAL_API_BASE}/v1/map-data`);
    

    if (industryId) externalUrl.searchParams.set('industryId', industryId);
    if (timeframe) externalUrl.searchParams.set('timeframe', timeframe);
    if (zipCodes) externalUrl.searchParams.set('zipCodes', zipCodes);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };


    if (API_SECRET_KEY) {
      headers['Authorization'] = `Bearer ${API_SECRET_KEY}`;
    }


    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(externalUrl.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
      keepalive: true,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      
      return NextResponse.json(
        { 
          error: 'External API request failed',
          details: `${response.status}: ${response.statusText}`,
          message: errorText
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('🔥 Proxy API Error:', error);
    
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout - external API took too long to respond';
        statusCode = 504; 
      } else if (error.message.includes('fetch failed') || error.message.includes('ECONNRESET') || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Failed to connect to external API - connection error';
        statusCode = 502; 
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout to external API';
        statusCode = 504; 
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Proxy request failed',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        ...(statusCode >= 502 && statusCode <= 504 && {
          suggestion: 'This appears to be a temporary network issue. Please try again in a few moments.'
        })
      },
      { status: statusCode }
    );
  }
}


export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
