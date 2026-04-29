export function aggregateWordTimestamps(alignment: any) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const wordTimestamps: any[] = [];
  
  let currentWord = "";
  let currentWordStartTime = null;
  let currentWordEndTime = null;
  
  const validWordCharRegex = /^[^\s]$/;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const startTime = character_start_times_seconds[i];
    const endTime = character_end_times_seconds[i];

    if (validWordCharRegex.test(char)) {
      if (currentWord === "") {
        currentWordStartTime = startTime;
      }
      currentWord += char;
      currentWordEndTime = endTime;
    } else {
      if (currentWord.length > 0) {
        wordTimestamps.push({
          word: currentWord,
          startTime: currentWordStartTime,
          endTime: currentWordEndTime
        });
        currentWord = ""; 
      }
    }
  }

  if (currentWord.length > 0) {
    wordTimestamps.push({
      word: currentWord,
      startTime: currentWordStartTime,
      endTime: currentWordEndTime
    });
  }

  return wordTimestamps;
}

export function shiftTimestampsForAdInsertion(transcript: any[], adInsertionTime: number, adDuration: number) {
  return transcript.map(segment => {
    if (segment.startTime < adInsertionTime) {
      return {...segment };
    }
    return {
      word: segment.word,
      startTime: segment.startTime + adDuration,
      endTime: segment.endTime + adDuration
    };
  });
}
