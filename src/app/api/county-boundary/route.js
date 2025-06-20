import { NextRequest, NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const county = searchParams.get('county');
    const state = searchParams.get('state');

    if (!county || !state) {
      return NextResponse.json(
        { error: 'County and state parameters are required' },
        { status: 400 }
      );
    }


    const countyQuery = `${county} County, ${state}`;
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(countyQuery)}&` +
      `format=json&` +
      `addressdetails=1&` +
      `extratags=1&` +
      `polygon_geojson=1&` +
      `limit=1`;
    
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'LeadsMap/1.0 (contact@example.com)', 
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

 
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching county boundary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch county boundary data' },
      { status: 500 }
    );
  }
}
