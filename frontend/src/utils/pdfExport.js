import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export const exportAttendanceReport = async (employees, weeklyLogs = []) => {
  const doc = new jsPDF();

  // Document Title
  doc.setFontSize(18);
  doc.setTextColor(33, 150, 243); // Premium blue accent
  doc.text('Attendance & Shift Hours Report', 14, 22);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28);

  // Table Columns
  const tableColumn = [
    'Employee ID',
    'Name',
    'Department/Branch',
    'Shift Start',
    'Off Time',
    'Weekly Hours Target',
    'Completed (This Week)',
    'Status'
  ];

  // Helper to calculate hours for this week from logs
  const calculateWeeklyCompleted = (employeeId) => {
    const empLogs = weeklyLogs.filter(log => log.employeeId === employeeId);
    let total = 0;
    empLogs.forEach(log => {
      if (log.checkIn && log.checkIn !== '--:--' && log.checkOut && log.checkOut !== '--:--') {
        const [inH, inM] = log.checkIn.split(':');
        const [outH, outM] = log.checkOut.split(':');
        const inMins = parseInt(inH) * 60 + parseInt(inM);
        const outMins = parseInt(outH) * 60 + parseInt(outM);
        if (outMins > inMins) {
          total += (outMins - inMins) / 60;
        }
      }
    });
    return parseFloat(total.toFixed(1));
  };

  let metTargetCount = 0;
  // Table Rows
  const tableRows = employees.map(emp => {
    const completed = calculateWeeklyCompleted(emp.employeeId);
    const target = emp.weeklyHours || 40;
    const diff = completed - target;
    let status = 'Met Target';
    if (diff < 0) {
      status = `${Math.abs(diff).toFixed(1)}h Short`;
    } else {
      status = diff > 0 ? `${diff.toFixed(1)}h Overtime` : 'Met Target';
      metTargetCount++;
    }

    return [
      emp.employeeId,
      emp.name,
      emp.department || 'Engineering',
      emp.arrivalTime || '09:00 AM',
      emp.departureTime || '05:00 PM',
      `${target}h`,
      `${completed}h`,
      status
    ];
  });

  // Summary Metrics Section
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text(`Weekly Target Summary: ${metTargetCount} out of ${employees.length} employees (${((metTargetCount / Math.max(1, employees.length)) * 100).toFixed(0)}%) met their weekly hour targets.`, 14, 34);
  doc.setFont('helvetica', 'normal');

  // Generate Table
  doc.autoTable({
    startY: 40,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // Slate dark blue
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    margin: { top: 30 }
  });
  // Generate filename
  const fileName = `Attendance_Report_${new Date().toISOString().split('T')[0]}.pdf`;

  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      // Native App Flow (Capacitor)
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      
      // Get base64 string from jsPDF
      const base64Data = doc.output('datauristring').split(',')[1];
      
      // Save to device Documents directory
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true
      });
      
      // Trigger native share dialog to allow user to open/save the PDF
      await Share.share({
        title: 'Attendance Report',
        text: 'Here is the generated attendance report.',
        url: savedFile.uri,
        dialogTitle: 'Share PDF'
      });
    } else {
      // Web Flow
      doc.save(fileName);
    }
  } catch (err) {
    console.error('Error saving or sharing PDF:', err);
  }
};
