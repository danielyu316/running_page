import React from 'react';
import { intComma } from '@/utils/utils';
import { MAIN_COLOR } from '@/utils/const';

const WorkoutStat = ({value, description, pace, className, distance, onClick, color}:
                         { value: string, description:string, pace: string, className: string, distance: string, onClick: (_year: string) => void , color: string}) =>
    (<div className={`${className || " "} pb-2 w-100`} onClick={onClick} style={{'color': color}}>
    <span className={`text-2xl font-bold italic`}>{intComma(value)}</span>
    <span className="text-l font-semibold italic">{description}</span>
    { pace && (<span className="text-1xl font-bold italic">{ " " +pace}</span>)}
    { pace && (<span className="text-l font-semibold italic"> Pace</span>)}

    { distance && (<span className="text-2xl font-bold italic">{ " " + distance}</span>)}
    { distance && (<span className="text-l font-semibold italic"> KM</span>)}

  </div>
);

export default WorkoutStat;
