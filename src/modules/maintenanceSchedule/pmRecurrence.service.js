/**
 * PM Recurrence Service
 * Handles automatic generation of PMs and work orders based on recurrence rules
 */

const getDaysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

const calculateNextOccurrence = (lastDate, rule) => {
  if (!rule || !lastDate) return null;

  const current = new Date(lastDate);
  const {
    recurrenceType,
    every = 1,
    unit = 'day',
    selectedWeekDays = [],
    selectedMonthDay = 1,
    selectedYearMonth = 1,
    selectedYearDay = 1,
  } = rule;

  if (recurrenceType === 'none' || !recurrenceType) {
    return null;
  }

  let next = new Date(current);

  if (recurrenceType === 'daily') {
    // Add days based on 'every' value
    const daysToAdd = Number(every) || 1;
    next.setDate(next.getDate() + daysToAdd);
  } else if (recurrenceType === 'weekly') {
    // If specific weekdays are selected, find next occurrence on those days
    if (Array.isArray(selectedWeekDays) && selectedWeekDays.length > 0) {
      // Start from tomorrow
      next.setDate(next.getDate() + 1);

      // Find next occurrence on selected days
      while (!selectedWeekDays.includes(next.getDay())) {
        next.setDate(next.getDate() + 1);
      }
    } else {
      // If no specific days, just add weeks
      const weeksToAdd = Number(every) || 1;
      next.setDate(next.getDate() + weeksToAdd * 7);
    }
  } else if (recurrenceType === 'monthly') {
    // Move to next month on the selected day
    next.setDate(1);
    next.setMonth(next.getMonth() + (Number(every) || 1));
    const dayOfMonth = Math.min(Number(selectedMonthDay) || 1, getDaysInMonth(next.getFullYear(), next.getMonth()));
    next.setDate(dayOfMonth);
  } else if (recurrenceType === 'yearly') {
    next.setDate(1);
    next.setFullYear(next.getFullYear() + (Number(every) || 1));
    next.setMonth(Math.min(Math.max((Number(selectedYearMonth) || 1) - 1, 0), 11));
    const dayOfMonth = Math.min(Number(selectedYearDay) || 1, getDaysInMonth(next.getFullYear(), next.getMonth()));
    next.setDate(dayOfMonth);
  }

  return next;
};

const shouldGenerateNextInstance = (schedule, rule) => {
  if (!rule || rule.recurrenceType === 'none') {
    return false;
  }

  const now = new Date();
  const nextDate = schedule.nextDate ? new Date(schedule.nextDate) : null;

  if (!nextDate) {
    return false;
  }

  // Check if it's time to generate (within the hour of the scheduled time)
  if (nextDate > now) {
    return false;
  }

  // Check recurrence end conditions
  if (rule.recurrenceEndType === 'date' && rule.recurrenceEndDate) {
    const endDate = new Date(rule.recurrenceEndDate);
    if (now > endDate) {
      return false;
    }
  }

  if (rule.recurrenceEndType === 'occurrences' && rule.recurrenceMaxOccurrences) {
    const occurrenceCount = schedule.occurrenceCount || 0;
    if (occurrenceCount >= Number(rule.recurrenceMaxOccurrences)) {
      return false;
    }
  }

  return true;
};

const calculateAllFutureOccurrences = (startDate, rule, limit = 12) => {
  if (!rule || rule.recurrenceType === 'none') {
    return [];
  }

  const occurrences = [];
  let current = new Date(startDate);

  for (let i = 0; i < limit; i++) {
    const next = calculateNextOccurrence(current, rule);
    if (!next) break;

    // Check end date condition
    if (rule.recurrenceEndType === 'date' && rule.recurrenceEndDate) {
      const endDate = new Date(rule.recurrenceEndDate);
      if (next > endDate) {
        break;
      }
    }

    // Check max occurrences condition
    if (rule.recurrenceEndType === 'occurrences' && rule.recurrenceMaxOccurrences) {
      if (i >= Number(rule.recurrenceMaxOccurrences) - 1) {
        occurrences.push(next);
        break;
      }
    }

    occurrences.push(next);
    current = next;
  }

  return occurrences;
};

const formatRecurrenceDisplay = (rule) => {
  if (!rule || rule.recurrenceType === 'none') {
    return 'One-time';
  }

  const { recurrenceType, every = 1, selectedWeekDays = [], selectedMonthDay = 1, selectedYearMonth = 1, selectedYearDay = 1 } = rule;
  const everyNum = Number(every) || 1;

  if (recurrenceType === 'daily') {
    return everyNum === 1 ? 'Every day' : `Every ${everyNum} days`;
  }

  if (recurrenceType === 'weekly') {
    const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (Array.isArray(selectedWeekDays) && selectedWeekDays.length > 0) {
      const dayNames = selectedWeekDays.map((idx) => weekDayNames[idx]).join(', ');
      return `Every week on ${dayNames}`;
    }
    return everyNum === 1 ? 'Every week' : `Every ${everyNum} weeks`;
  }

  if (recurrenceType === 'monthly') {
    return everyNum === 1
      ? `Every month on day ${selectedMonthDay}`
      : `Every ${everyNum} months on day ${selectedMonthDay}`;
  }

  if (recurrenceType === 'yearly') {
    const monthIndex = Math.min(Math.max((Number(selectedYearMonth) || 1) - 1, 0), 11);
    const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex];
    return everyNum === 1
      ? `Every year on ${monthName} ${selectedYearDay}`
      : `Every ${everyNum} years on ${monthName} ${selectedYearDay}`;
  }

  return 'Custom schedule';
};

const getRecurrenceEndDisplay = (rule) => {
  if (!rule || rule.recurrenceEndType === 'never') {
    return 'Repeats indefinitely';
  }

  if (rule.recurrenceEndType === 'date' && rule.recurrenceEndDate) {
    const date = new Date(rule.recurrenceEndDate);
    return `Until ${date.toLocaleDateString()}`;
  }

  if (rule.recurrenceEndType === 'occurrences' && rule.recurrenceMaxOccurrences) {
    return `For ${rule.recurrenceMaxOccurrences} occurrences`;
  }

  return 'No end date set';
};

module.exports = {
  calculateNextOccurrence,
  shouldGenerateNextInstance,
  calculateAllFutureOccurrences,
  formatRecurrenceDisplay,
  getRecurrenceEndDisplay,
};
