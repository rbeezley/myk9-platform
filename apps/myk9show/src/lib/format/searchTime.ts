export interface SecondsParts {
  minutes: number;
  seconds: number;
  centis: number;
}

/**
 * Split decimal seconds into whole minutes, seconds and centiseconds.
 * Works in integer centiseconds so 61.23 stays 23 (flooring the float
 * fraction gives 22) and a rounded-up hundredth carries into the second
 * and minute. The one rule behind every m:ss.cc display (MYK9-1225).
 */
export function splitSecondsToCentis(secs: number): SecondsParts {
  const totalCs = Math.round(secs * 100);
  return {
    minutes: Math.floor(totalCs / 6000),
    seconds: Math.floor((totalCs % 6000) / 100),
    centis: totalCs % 100,
  };
}
