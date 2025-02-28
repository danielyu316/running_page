import * as mapboxPolyline from '@mapbox/polyline';
import gcoord from 'gcoord';
import { WebMercatorViewport } from 'viewport-mercator-project';
import { chinaGeojson, RPGeometry } from '@/static/run_countries';
import worldGeoJson from '@surbowl/world-geo-json-zh/world.zh.json';
import { chinaCities } from '@/static/city';
import {
  MAIN_COLOR,
  MUNICIPALITY_CITIES_ARR,
  NEED_FIX_MAP,
  RUN_TITLES,
  RIDE_COLOR,
  VIRTUAL_RIDE_COLOR,
  HIKE_COLOR,
  SWIM_COLOR,
  ROWING_COLOR,
  ROAD_TRIP_COLOR,
  FLIGHT_COLOR,
  RUN_COLOR,
  KAYAKING_COLOR,
  SNOWBOARD_COLOR,
  TRAIL_RUN_COLOR,
  RICH_TITLE,
} from './const';
import { FeatureCollection, LineString } from 'geojson';

export type Coordinate = [number, number];
//add new type to highlight route
export type RunId = number;

export type RunIds = RunId[];

export interface Activity {
  run_id: RunId;
  name: string;
  distance: number;
  moving_time: string;
  type: string;
  start_date: string;
  start_date_local: string;
  location_country?: string | null;
  summary_polyline?: string | null;
  average_heartrate?: number | null;
  elevation_gain: number | null;
  average_speed: number;
  streak: number;
  route?: string | null;
  partner?: string | null;
}

const titleForShow = (run: Activity): string => {
  const date = run.start_date_local.slice(0, 11);
  const distance = (run.distance / 1000.0).toFixed(1);
  let name = 'Run';
  if (run.name) {
    name = run.name;
  }
  const type=run.type;
  let  route='';
  if (run.route){
    route=run.route;
  }
  return `${type} ${date} ${distance}  KM ${run.route?'@'+route:''} ${!run.summary_polyline ? '(No map data for this workout)' : ''
    }`;
};

const formatPace = (d: number): string => {
  if (Number.isNaN(d) || d == 0) return '0';
  const pace = (1000.0 / 60.0) * (1.0 / d);
  const minutes = Math.floor(pace);
  const seconds = Math.floor((pace - minutes) * 60.0);
  return `${minutes}'${seconds.toFixed(0).toString().padStart(2, '0')}"`;
};

const convertMovingTime2Sec = (moving_time: string): number => {
  if (!moving_time) {
    return 0;
  }
  // moving_time : '2 days, 12:34:56' or '12:34:56';
  const splits = moving_time.split(', ');
  const days = splits.length == 2 ? parseInt(splits[0]) : 0;
  const time = splits.splice(-1)[0];
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  return totalSeconds;
};

const formatRunTime = (moving_time: string): string => {
  const totalSeconds = convertMovingTime2Sec(moving_time);
  const totalMinutes = Math.floor(totalSeconds / 60); // 总分钟数

  // 分解小时和分钟
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

 
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  
};

// for scroll to the map
const scrollToMap = () => {
  const el = document.querySelector('.fl.w-100.w-70-l');
  const rect = el?.getBoundingClientRect();
  if (rect) {
    window.scroll(rect.left + window.scrollX, rect.top + window.scrollY);
  }
};

const extractCities = (str: string): string[] => {
  const locations = [];
  let match;
  const pattern = /([\u4e00-\u9fa5]{2,}(市|自治州|特别行政区|盟|地区|路线))/g;
  while ((match = pattern.exec(str)) !== null) {
    locations.push(match[0]);
  }

  return locations;
};

const extractDistricts = (str: string): string[] => {
  const locations = [];
  let match;
  const pattern = /([\u4e00-\u9fa5]{2,}(区|县|路线))/g;
  while ((match = pattern.exec(str)) !== null) {
    locations.push(match[0]);
  }

  return locations;
}

const extractCoordinate = (str: string): [number, number] | null => {
  const pattern = /'latitude': ([-]?\d+\.\d+).*?'longitude': ([-]?\d+\.\d+)/;
  const match = str.match(pattern);

  if (match) {
    const latitude = parseFloat(match[1]);
    const longitude = parseFloat(match[2]);
    return [longitude, latitude];
  }

  return null;
};

const cities = chinaCities.map((c) => c.name);
const locationCache = new Map<number, ReturnType<typeof locationForRun>>();
// what about oversea?
const locationForRun = (
  run: Activity
): {
  country: string;
  province: string;
  city: string;
  coordinate: [number, number] | null;
} => {
  if (locationCache.has(run.run_id)) {
    return locationCache.get(run.run_id)!;
  }
  let location = run.location_country;
  let [city, province, country] = ['', '', ''];
  let coordinate = null;
  if (location) {
    // Only for Chinese now
    // should filter 臺灣
    const cityMatch = extractCities(location);
    const provinceMatch = location.match(/[\u4e00-\u9fa5]{2,}(省|自治区)/);

    if (cityMatch  && cityMatch.length > 0) {
      city = cities.find((value) => cityMatch.includes(value)) as string;

      // if (!city) {
      //   city = '';
      // }
      if (!city) {
        if (cityMatch[0].includes("路线")) {
            city = cityMatch[0];
        } else {
            city = '';
        }
    }
      
    }
    if (provinceMatch) {
      [province] = provinceMatch;
      // try to extract city coord from location_country info
      coordinate = extractCoordinate(location);
    }
    const l = location.split(',');
    // or to handle keep location format
    let countryMatch = l[l.length - 1].match(
      /[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/
    );
    if (!countryMatch && l.length >= 3) {
      countryMatch = l[2].match(/[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/);
    }
    if (countryMatch) {
      [country] = countryMatch;
    }
  }
  if (MUNICIPALITY_CITIES_ARR.includes(city)) {
    province = city;
    if (location) {
      const districtMatch = extractDistricts(location);
      if (districtMatch.length > 0) {
        city = districtMatch[districtMatch.length - 1];
      }
    }
  }

  const r = { country, province, city, coordinate };
  locationCache.set(run.run_id, r);
  return r;
};

const intComma = (x = '') => {
  if (x.toString().length <= 5) {
    return x;
  }
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const pathForRun = (run: Activity): Coordinate[] => {
  try {
    if (!run.summary_polyline) {
      return [];
    }
    const c = mapboxPolyline.decode(run.summary_polyline);
    // reverse lat long for mapbox
    c.forEach((arr) => {
      [arr[0], arr[1]] = !NEED_FIX_MAP
        ? [arr[1], arr[0]]
        : gcoord.transform([arr[1], arr[0]], gcoord.GCJ02, gcoord.WGS84);
    });
    // try to use location city coordinate instead , if runpath is incomplete
    if (c.length === 2 && String(c[0]) === String(c[1])) {
      const { coordinate } = locationForRun(run);
      if (coordinate?.[0] && coordinate?.[1]) {
        return [coordinate, coordinate];
      }
    }
    return c;
  } catch (err) {
    return [];
  }
};
//add new ids to selectedIds
const geoJsonForRuns = (runs: Activity[],selectedIds: RunIds = []): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: runs.map((run) => {
    const points = pathForRun(run);

    return {
      type: 'Feature',
      properties: {
        'color': colorFromType(run.type),
        isSelected: selectedIds.includes(run.run_id), // 👈 新增选中标记
        
      },
      geometry: {
        type: 'LineString',
        coordinates: points,
        workoutType: run.type,
      },
      name: run.name,
    };
  }),
});

const geoJsonForMap = (): FeatureCollection<RPGeometry> => ({
  type: 'FeatureCollection',
  features: worldGeoJson.features.concat(chinaGeojson.features),
})

const titleForType = (type: string): string => {
  switch (type) {
    case 'Outdoor Run':
      return RUN_TITLES.RUN_TITLE;
    case 'Full Marathon':
      return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
    case 'Half Marathon':
      return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
    case 'Treadmill':
      return RUN_TITLES.TRAIL_RUN_TITLE;
    case 'Ride':
      return RUN_TITLES.RIDE_TITLE;
    case 'Indoor Ride':
      return RUN_TITLES.INDOOR_RIDE_TITLE;
    case 'VirtualRide':
      return RUN_TITLES.VIRTUAL_RIDE_TITLE;
    case 'Hike':
      return RUN_TITLES.HIKE_TITLE;
    case 'Rowing':
      return RUN_TITLES.ROWING_TITLE;
    case 'Swim':
      return RUN_TITLES.SWIM_TITLE;
    case 'RoadTrip':
      return RUN_TITLES.ROAD_TRIP_TITLE;
    case 'Flight':
      return RUN_TITLES.FLIGHT_TITLE;
    case 'Kayaking':
      return RUN_TITLES.KAYAKING_TITLE;
    case 'Snowboard':
      return RUN_TITLES.SNOWBOARD_TITLE;
    case 'Ski':
      return RUN_TITLES.SKI_TITLE;
    default:
      return RUN_TITLES.RUN_TITLE;
  }
}

const typeForRun = (run: Activity): string => {
  const type = run.type
  var distance = run.distance / 1000;
  switch (type) {
    case 'Outdoor Run':
      if (distance >= 40) {
        return 'Full Marathon';
      }
      else if (distance > 20) {
        return 'Half Marathon';
      }
      return 'Run';
    case 'Treadmill':
      if (distance >= 40) {
        return 'Full Marathon';
      }
      else if (distance > 20) {
        return 'Half Marathon';
      }
      return 'Treadmill';
    default:
      return type;
  }
}

const titleForRun = (run: Activity): string => {
  const type = run.type;
  if (RICH_TITLE) {
    // 1. try to use user defined name
    if (run.type != '') {
      return titleForType(typeForRun(run));
    }
    // 2. try to use location+type if the location is available, eg. 'Shanghai Run'
    const { city, province } = locationForRun(run);
    const activity_sport = titleForType(typeForRun(run));
    if (city && city.length > 0 && activity_sport.length > 0) {
      return `${city} ${activity_sport}`;
    }
  }
  // 3. use time+length if location or type is not available
  if ( type == 'Outdoor Run'){
      const runDistance = run.distance / 1000;
      if (runDistance >= 40) {
        return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
      }
      else if (runDistance > 20) {
        return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
      }
  }
  return titleForType(type);
};

const colorFromType = (workoutType: string): string => {
  switch (workoutType) {
    case 'Outdoor Run':
      return RUN_COLOR;
    case 'Treadmill':
      return TRAIL_RUN_COLOR;
    case 'Ride':
      return RIDE_COLOR;
    case 'Indoor Ride':
      return RIDE_COLOR;
    case 'VirtualRide':
      return VIRTUAL_RIDE_COLOR;
    case 'Hike':
      return HIKE_COLOR;
    case 'Rowing':
      return ROWING_COLOR;
    case 'Swim':
      return SWIM_COLOR;
    case 'RoadTrip':
      return ROAD_TRIP_COLOR;
    case 'Flight':
      return FLIGHT_COLOR;
    case 'Kayaking':
      return KAYAKING_COLOR;
    case 'Snowboard':
    case 'Ski':
      return SNOWBOARD_COLOR;
    default:
      return MAIN_COLOR;
  }
};

export interface IViewState {
  longitude?: number;
  latitude?: number;
  zoom?: number;
}

const getBoundsForGeoData = (
  geoData: FeatureCollection<LineString>
): IViewState => {
  const { features } = geoData;
  let points: Coordinate[] = [];
  // find first have data
  for (const f of features) {
    if (f.geometry.coordinates.length) {
      points = f.geometry.coordinates as Coordinate[];
      break;
    }
  }
  if (points.length === 0) {
    return { longitude: 20, latitude: 20, zoom: 3 };
  }
  if (points.length === 2 && String(points[0]) === String(points[1])) {
    return { longitude: points[0][0], latitude: points[0][1], zoom: 9 };
  }
  // Calculate corner values of bounds
  const pointsLong = points.map((point) => point[0]) as number[];
  const pointsLat = points.map((point) => point[1]) as number[];
  const cornersLongLat: [Coordinate, Coordinate] = [
    [Math.min(...pointsLong), Math.min(...pointsLat)],
    [Math.max(...pointsLong), Math.max(...pointsLat)],
  ];
  // 计算所有坐标点的最小/最大经纬度
  const viewState = new WebMercatorViewport({
    width: 800,
    height: 600,
  }).fitBounds(cornersLongLat, { padding: 200 });
  let { longitude, latitude, zoom } = viewState;
  // if (features.length > 1) {
  //   zoom = 12;
  // }
  // 计算经纬度范围
const longSpan = Math.max(...pointsLong) - Math.min(...pointsLong);
const latSpan = Math.max(...pointsLat) - Math.min(...pointsLat);
// 根据范围调整缩放级别
const baseZoom = viewState.zoom;
// console.log(baseZoom)
let adaptiveZoom = baseZoom;
// 当经纬跨度均小于阈值时视为集中区域（单位：度）
const CONCENTRATION_THRESHOLD = 0.01; // 约500米范围
if (longSpan < CONCENTRATION_THRESHOLD && latSpan < CONCENTRATION_THRESHOLD) {
  // 计算集中程度比例（0~1区间）
  const concentrationRatio = Math.max(
    longSpan / CONCENTRATION_THRESHOLD,
    latSpan / CONCENTRATION_THRESHOLD
  );
  // console.log(concentrationRatio)
  // 动态增加缩放级别（示例公式）
  adaptiveZoom = baseZoom + (1 - concentrationRatio) ; // 最大增加2级
}
// 结合原有逻辑
if (features.length > 1) {
  zoom = Math.min(adaptiveZoom, 20); // 确保不超过12级
}
  return { longitude, latitude, zoom };
};

const filterYearRuns = (run: Activity, year: string) => {
  if (run && run.start_date_local) {
    return run.start_date_local.slice(0, 4) === year;
  }
  return false;
};

const filterCityRuns = (run: Activity, city: string) => {
  if (run && run.location_country) {
    return run.location_country.includes(city);
  }
  return false;
};
const filterTitleRuns = (run: Activity, title: string) =>
  titleForRun(run) === title;

const filterTypeRuns = (run: Activity, type: string) => {
  switch (type){
    case 'Full Marathon':
      return (run.type === 'Run' || run.type === 'Trail Run') && run.distance > 40000
    case 'Half Marathon':
      return (run.type === 'Run' || run.type === 'Trail Run') && run.distance < 40000 && run.distance > 20000
    default:
      return run.type === type
  }
}

const filterAndSortRuns = (
  activities: Activity[],
  item: string,
  filterFunc: (_run: Activity, _bvalue: string) => boolean,
  sortFunc: (_a: Activity, _b: Activity) => number,
  item2: string | null,
  filterFunc2: ((_run: Activity, _bvalue: string) => boolean) | null,
) => {
  let s = activities;
  if (item !== 'Total') {
    s = activities.filter((run) => filterFunc(run, item));
  }
  if(filterFunc2 != null && item2 != null){
    s = s.filter((run) => filterFunc2(run, item2));
  }
  return s.sort(sortFunc);
};

const sortDateFunc = (a: Activity, b: Activity) => {
  return (
    new Date(b.start_date_local.replace(' ', 'T')).getTime() -
    new Date(a.start_date_local.replace(' ', 'T')).getTime()
  );
};
const sortDateFuncReverse = (a: Activity, b: Activity) => sortDateFunc(b, a);

export {
  titleForShow,
  formatPace,
  scrollToMap,
  locationForRun,
  intComma,
  pathForRun,
  geoJsonForRuns,
  geoJsonForMap,
  titleForRun,
  typeForRun,
  titleForType,
  filterYearRuns,
  filterCityRuns,
  filterTitleRuns,
  filterAndSortRuns,
  sortDateFunc,
  sortDateFuncReverse,
  getBoundsForGeoData,
  filterTypeRuns,
  colorFromType,
  formatRunTime,
  convertMovingTime2Sec,
};
