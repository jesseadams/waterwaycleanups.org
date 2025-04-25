import React from 'react';

const DateIcon = ({ date, className }) => {
  // Parse date to get components if it's a valid date string
  // This will allow formatting the date differently if needed
  let formattedDate = date;
  try {
    const dateObj = new Date(date);
    if (!isNaN(dateObj)) {
      // Use the original string as it might be already formatted nicely
      formattedDate = date;
    }
  } catch (e) {
    // If parsing fails, use the original string
    console.log("Date parsing error:", e);
  }

  return (
    <div className={`date-icon-container ${className || ''}`}>
      <i className="lni lni-calendar"></i>
      <span>{formattedDate}</span>
    </div>
  );
};

export default DateIcon; 