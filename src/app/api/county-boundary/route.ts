import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
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

    // Build the proper query string for a county search
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
        'User-Agent': 'LeadsMap/1.0 (contact@example.com)', // Required by Nominatim
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    // Return the full Nominatim response array to match the expected format
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching county boundary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch county boundary data' },
      { status: 500 }
    );
  }
}
