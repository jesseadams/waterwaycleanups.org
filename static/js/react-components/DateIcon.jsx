import React from 'react';
import { Calendar } from 'lineicons-react';

const DateIcon = ({ date, className }) => {
  //* Parse date to get components if it's a valid date string - this will allow formatting the date differently if needed
  let formattedDate = date;
  try {
    const dateObj = new Date(date);
    if (!isNaN(dateObj)) {
      //* Use original string
      formattedDate = date;
    }
  } catch (e) {
    //* Only after attempting to parse the date, log the error
    //console.log("Date parsing error:", e);
  }

  return (
    <div className={`date-icon-container ${className || ''}`}>
      <Calendar />
      <span>{formattedDate}</span>
    </div>
  );
};

export default DateIcon; 