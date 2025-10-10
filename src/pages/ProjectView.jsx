"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  ListTodo,
  Users,
  AlertTriangle,
  Filter,
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function ProjectView() {
  const [dashboardType, setDashboardType] = useState("checklist");
  const [searchQuery, setSearchQuery] = useState("");

  const [isLoading, setIsLoading] = useState(true);

  // State for department data
  const [departmentData, setDepartmentData] = useState({
    allTasks: [],
    staffMembers: [],
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    completionRate: 0,
    barChartData: [],
    pieChartData: [],
    // Add new counters for delegation mode
    completedRatingOne: 0,
    completedRatingTwo: 0,
    completedRatingThreePlus: 0,
  });

  // Store the current date for overdue calculation
  const [currentDate, setCurrentDate] = useState(new Date());

  // Format date as DD/MM/YYYY
  const formatDateToDDMMYYYY = (date) => {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Parse DD/MM/YYYY to Date object
  const parseDateFromDDMMYYYY = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return null;
    const parts = dateStr.split("/");
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
  };

  // Function to check if a date is in the past
  const isDateInPast = (dateStr) => {
    const date = parseDateFromDDMMYYYY(dateStr);
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Function to check if a date is today
  const isDateToday = (dateStr) => {
    const date = parseDateFromDDMMYYYY(dateStr);
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  };

  // Safe access to cell value
  const getCellValue = (row, index) => {
    if (!row || !row.c || index >= row.c.length) return null;
    const cell = row.c[index];
    return cell && "v" in cell ? cell.v : null;
  };

  // Parse Google Sheets Date format into a proper date string
  const parseGoogleSheetsDate = (dateStr) => {
    if (!dateStr) return "";

    // Debug log for date parsing
    // console.log(`Parsing date: "${dateStr}" (type: ${typeof dateStr})`);

    if (typeof dateStr === "string" && dateStr.startsWith("Date(")) {
      // Handle Google Sheets Date(year,month,day) format
      const match = /Date\((\d+),(\d+),(\d+)\)/.exec(dateStr);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10); // 0-indexed in Google's format
        const day = parseInt(match[3], 10);

        // Format as DD/MM/YYYY
        const formatted = `${day.toString().padStart(2, "0")}/${(month + 1)
          .toString()
          .padStart(2, "0")}/${year}`;
        // console.log(`Converted Google Sheets date to: ${formatted}`);
        return formatted;
      }
    }

    // If it's already in DD/MM/YYYY format, return as is
    if (
      typeof dateStr === "string" &&
      dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
    ) {
      // Normalize to DD/MM/YYYY format
      const parts = dateStr.split("/");
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      const normalized = `${day}/${month}/${year}`;
      // console.log(`Normalized date to: ${normalized}`);
      return normalized;
    }

    // Handle Date objects
    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      const formatted = formatDateToDDMMYYYY(dateStr);
      // console.log(`Converted Date object to: ${formatted}`);
      return formatted;
    }

    // If we get here, try to parse as a date and format
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const formatted = formatDateToDDMMYYYY(date);
        // console.log(`Parsed generic date to: ${formatted}`);
        return formatted;
      }
    } catch (e) {
      console.error("Error parsing date:", e);
    }

    // Return original if parsing fails
    // console.log(`Failed to parse date, returning original: ${dateStr}`);
    return dateStr;
  };

  // Modified fetch function to support both checklist and delegation
  const fetchDepartmentData = async () => {
    // For delegation mode, always use "DELEGATION" sheet
    // For checklist mode, use "Checklist" as default sheet
    const sheetName =
      dashboardType === "delegation" ? "DELEGATION" : "Checklist";

    setIsLoading(true);

    try {
      const response = await fetch(
        `https://docs.google.com/spreadsheets/d/1TSHYw5iEMj1_K1oeVjqMcG6uQRVHQ3Ejj2W0IimJmpg/gviz/tq?tqx=out:json&sheet=${sheetName}`
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${sheetName} sheet data: ${response.status}`
        );
      }

      const text = await response.text();
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      const jsonString = text.substring(jsonStart, jsonEnd + 1);
      const data = JSON.parse(jsonString);

      // Get current user details
      const username = sessionStorage.getItem("username");
      const userRole = sessionStorage.getItem("role");

      // Initialize counters - UPDATED: All counters now count ALL tasks (including future dates)
      let totalTasks = 0;
      let completedTasks = 0;
      let pendingTasks = 0;
      let overdueTasks = 0;

      // Add new counters for delegation mode
      let completedRatingOne = 0;
      let completedRatingTwo = 0;
      let completedRatingThreePlus = 0;

      // Monthly data for bar chart (only for tasks up to today for chart display)
      const monthlyData = {
        Jan: { completed: 0, pending: 0 },
        Feb: { completed: 0, pending: 0 },
        Mar: { completed: 0, pending: 0 },
        Apr: { completed: 0, pending: 0 },
        May: { completed: 0, pending: 0 },
        Jun: { completed: 0, pending: 0 },
        Jul: { completed: 0, pending: 0 },
        Aug: { completed: 0, pending: 0 },
        Sep: { completed: 0, pending: 0 },
        Oct: { completed: 0, pending: 0 },
        Nov: { completed: 0, pending: 0 },
        Dec: { completed: 0, pending: 0 },
      };

      // Status data for pie chart (only for tasks up to today for chart display)
      const statusData = {
        Completed: 0,
        Pending: 0,
        Overdue: 0,
      };

      // Staff tracking map
      const staffTrackingMap = new Map();

      // Get today's date for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get tomorrow's date for comparison
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      // Process row data
      const processedRows = data.table.rows
        .map((row, rowIndex) => {
          // Skip header row
          if (rowIndex === 0) return null;

          // For non-admin users, filter by username in Column E (index 4) - "Name"
          const assignedTo = getCellValue(row, 4) || "Unassigned";
          const isUserMatch =
            userRole === "admin" ||
            assignedTo.toLowerCase() === username.toLowerCase();

          // If not a match and not admin, skip this row
          if (!isUserMatch) {
            // if (rowIndex <= 5)
            // console.log(`Row ${rowIndex + 1}: Skipped due to user mismatch`);
            return null;
          }

          // Check column B for valid task row - "Task ID"
          const taskId = getCellValue(row, 1); // Column B (index 1)

          // More lenient validation - allow any non-empty value as task ID
          if (
            taskId === null ||
            taskId === undefined ||
            taskId === "" ||
            (typeof taskId === "string" && taskId.trim() === "")
          ) {
            if (rowIndex <= 5)
            //   console.log(
            //     `Row ${rowIndex + 1}: Skipped due to empty/null task ID`
            //   );
            return null;
          }

          // Convert task ID to string for consistency
          const taskIdStr = String(taskId).trim();

          // Get task start date from Column G (index 6) - "Task Start Date"
          let taskStartDateValue = getCellValue(row, 6);
          const taskStartDate = taskStartDateValue
            ? parseGoogleSheetsDate(String(taskStartDateValue))
            : "";

          // Debug: Log task start date for first few rows

          // UPDATED: For both modes, process ALL tasks with valid task IDs and dates
          if (dashboardType === "delegation") {
            // For DELEGATION mode: Process ALL tasks with valid task IDs, no date filtering
            if (
              !taskId ||
              taskId === null ||
              taskId === undefined ||
              taskId === "" ||
              (typeof taskId === "string" && taskId.trim() === "")
            ) {
              if (rowIndex <= 5)
                // console.log(
                //   `Row ${
                //     rowIndex + 1
                //   }: Skipped due to invalid task ID in delegation mode`
                // );
              return null;
            }
          } else {
            // For CHECKLIST mode: Process ALL tasks with valid dates (including future dates)
            const taskStartDateObj = parseDateFromDDMMYYYY(taskStartDate);

            // Process ALL tasks that have a valid start date (including future dates)
            if (!taskStartDateObj) {
              // if (rowIndex <= 5)
              //   console.log(`Row ${rowIndex + 1}: Skipped due to invalid date`);
              return null;
            }
          }

          // Get completion data based on dashboard type
          let completionDateValue, completionDate;
          if (dashboardType === "delegation") {
            // For delegation: Column L (index 11) - "Actual"
            completionDateValue = getCellValue(row, 11);
          } else {
            // For checklist: Column K (index 10) - "Actual"
            completionDateValue = getCellValue(row, 10);
          }

          completionDate = completionDateValue
            ? parseGoogleSheetsDate(String(completionDateValue))
            : "";

          const projectName = getCellValue(row, 2) || "N/A";

          const uniqueKey = `${projectName}|||${assignedTo}`;

          // Track staff details
          if (!staffTrackingMap.has(uniqueKey)) {
            staffTrackingMap.set(uniqueKey, {
              name: assignedTo,
              projectName: projectName, // ADD THIS LINE
              totalTasks: 0,
              completedTasks: 0,
              pendingTasks: 0,
              overdueTasks: 0, // ADD THIS LINE
              progress: 0,
            });
          }

          // Get additional task details
          const taskDescription = getCellValue(row, 5) || "Untitled Task"; // Column F - "Task Description"
          const frequency = getCellValue(row, 7) || "one-time"; // Column H - "Freq"

          // UPDATED: Determine task status - simplified logic
          let status = "pending";

          if (completionDate && completionDate !== "") {
            status = "completed";
          } else if (
            isDateInPast(taskStartDate) &&
            !isDateToday(taskStartDate)
          ) {
            // Past dates (excluding today) = overdue
            status = "overdue";
          } else {
            // Today or future dates = pending
            status = "pending";
          }

          // Create the task object
          const taskObj = {
            id: taskIdStr,
            title: taskDescription,
            assignedTo,
            projectName,
            taskStartDate,
            dueDate: taskStartDate, // Keep for compatibility
            status,
            frequency,
          };

          // Debug: Log task object for first few rows
          // if (rowIndex <= 5) {
          //   console.log(`Row ${rowIndex + 1}: Created task object:`, taskObj);
          // }

          // Update staff member totals
          const staffData = staffTrackingMap.get(uniqueKey);
          staffData.totalTasks++;

          // UPDATED: Count ALL tasks for dashboard cards (including future dates)
          totalTasks++;

          if (status === "completed") {
            completedTasks++;
            staffData.completedTasks++;

            // For delegation mode, count by rating
            if (dashboardType === "delegation") {
              const ratingValue = getCellValue(row, 18); // Column R - "Pending Color Code"
              if (ratingValue === 1) {
                completedRatingOne++;
              } else if (ratingValue === 2) {
                completedRatingTwo++;
              } else if (ratingValue > 2) {
                completedRatingThreePlus++;
              }
            }

            // Update monthly data for completed tasks (only for chart - tasks up to today)
            const taskStartDateObj = parseDateFromDDMMYYYY(taskStartDate);
            if (taskStartDateObj && taskStartDateObj <= today) {
              statusData.Completed++;
              const completedMonth = parseDateFromDDMMYYYY(completionDate);
              if (completedMonth) {
                const monthName = completedMonth.toLocaleString("default", {
                  month: "short",
                });
                if (monthlyData[monthName]) {
                  monthlyData[monthName].completed++;
                }
              }
            }
          } else {
            // Task is not completed
            pendingTasks++; // All incomplete tasks count as pending
            staffData.pendingTasks++;

            if (isDateInPast(taskStartDate) && !isDateToday(taskStartDate)) {
              // Past dates (excluding today) = overdue
              overdueTasks++;
              staffData.overdueTasks++;
            }

            // Update monthly data and status data for charts (only for tasks up to today)
            const taskStartDateObj = parseDateFromDDMMYYYY(taskStartDate);
            if (taskStartDateObj && taskStartDateObj <= today) {
              if (isDateInPast(taskStartDate) && !isDateToday(taskStartDate)) {
                statusData.Overdue++;
              } else {
                statusData.Pending++;
              }

              const monthName = today.toLocaleString("default", {
                month: "short",
              });
              if (monthlyData[monthName]) {
                monthlyData[monthName].pending++;
              }
            }
          }

          return taskObj;
        })
        .filter((task) => task !== null);

      // Calculate completion rate
      const completionRate =
        totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

      // Convert monthly data to chart format
      const barChartData = Object.entries(monthlyData).map(([name, data]) => ({
        name,
        completed: data.completed,
        pending: data.pending,
      }));

      // Convert status data to pie chart format
      const pieChartData = [
        { name: "Completed", value: statusData.Completed, color: "#22c55e" },
        { name: "Pending", value: statusData.Pending, color: "#facc15" },
        { name: "Overdue", value: statusData.Overdue, color: "#ef4444" },
      ];

      // Process staff tracking map
      const staffMembers = Array.from(staffTrackingMap.values()).map(
        (staff) => {
          const progress =
            staff.totalTasks > 0
              ? Math.round((staff.completedTasks / staff.totalTasks) * 100)
              : 0;

          return {
            id: staff.name.replace(/\s+/g, "-").toLowerCase(),
            name: staff.name,
            projectName: staff.projectName,
            email: `${staff.name
              .toLowerCase()
              .replace(/\s+/g, ".")}@example.com`,
            totalTasks: staff.totalTasks,
            completedTasks: staff.completedTasks,
            pendingTasks: staff.pendingTasks,
            overdueTasks: staff.overdueTasks,
            progress,
          };
        }
      );

    //   console.log("processedRows", processedRows);

      // Update department data state
      setDepartmentData({
        allTasks: processedRows,
        staffMembers,
        totalTasks, // Now includes ALL tasks (including future dates)
        completedTasks, // Now includes ALL completed tasks
        pendingTasks, // Now includes ALL pending tasks (including future dates)
        overdueTasks, // Only past dates excluding today
        completionRate,
        barChartData,
        pieChartData,
        completedRatingOne,
        completedRatingTwo,
        completedRatingThreePlus,
      });
    } catch (error) {
      console.error(`Error fetching ${sheetName} sheet data:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartmentData();
  }, [dashboardType]);

  // When dashboard loads, set current date
  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  const [projectSearchQuery, setProjectSearchQuery] = useState("");

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold tracking-tight text-blue-700">
            Project View Section
          </h1>
          <div className="flex items-center gap-2">
            {/* Dashboard Type Selection */}
            <select
              value={dashboardType}
              onChange={(e) => {
                setDashboardType(e.target.value);
              }}
              className="w-[140px] rounded-md border border-blue-200 p-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="checklist">Checklist</option>
              <option value="delegation">Delegation</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {/* Search Section */}
          <div className="rounded-lg border border-blue-200 bg-white p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="project-search"
                  className="flex items-center text-blue-700 text-sm font-medium"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Search by Project Name
                </label>
                <input
                  id="project-search"
                  placeholder="Enter project name..."
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-blue-200 p-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="name-search"
                  className="flex items-center text-blue-700 text-sm font-medium"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Search by Name
                </label>
                <input
                  id="name-search"
                  placeholder="Enter staff name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-blue-200 p-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Table Section */}
          <div className="rounded-lg border border-blue-200 shadow-lg bg-white overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-600 p-4">
              <h3 className="text-white font-semibold text-lg">
                Pending Tasks Summary
              </h3>
              <p className="text-blue-100 text-sm">
                {dashboardType === "delegation"
                  ? "Pending tasks by staff (Delegation)"
                  : "Pending tasks by staff (Checklist)"}
              </p>
            </div>

            <div className="hidden sm:block overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-blue-100 to-blue-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider border-b-2 border-blue-300">
                        Project Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider border-b-2 border-blue-300">
                        Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider border-b-2 border-blue-300">
                        Total Given
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider border-b-2 border-blue-300">
                        Total Task Completed
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider border-b-2 border-blue-300">
                        No of Pending Tasks
                      </th>
                      
                      <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider border-b-2 border-blue-300">
                        No of Overdue Tasks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {isLoading ? (
                      <tr className="">
                        <td colSpan="6" className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-gray-600 font-medium">
                              Loading staff data...
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      departmentData.staffMembers
                        .filter((staff) => {
                          const matchesName =
                            searchQuery === "" ||
                            staff.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase());
                          const matchesProject =
                            projectSearchQuery === "" ||
                            (staff.projectName &&
                              staff.projectName
                                .toLowerCase()
                                .includes(projectSearchQuery.toLowerCase()));
                          return matchesName && matchesProject;
                        })
                        .map((staff, index) => (
                          <tr
                            key={staff.id}
                            className={`hover:bg-blue-50 transition-colors ${
                              index % 2 === 0 ? "bg-white" : "bg-gray-50"
                            }`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {staff.projectName || "N/A"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center mr-3">
                                  <span className="text-sm font-bold text-white">
                                    {staff.name.charAt(0)}
                                  </span>
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {staff.name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {staff.email}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                                {staff.pendingTasks + staff.completedTasks}
                              </span>
                            </td>


                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                {staff.completedTasks}
                              </span>
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                                {staff.pendingTasks}
                              </span>
                            </td>

                            

                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                {staff.overdueTasks || 0}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                    {departmentData.staffMembers.filter((staff) => {
                      const matchesName =
                        searchQuery === "" ||
                        staff.name
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase());
                      const matchesProject =
                        projectSearchQuery === "" ||
                        (staff.projectName &&
                          staff.projectName
                            .toLowerCase()
                            .includes(projectSearchQuery.toLowerCase()));
                      return matchesName && matchesProject;
                    }).length === 0 && (
                      <tr>
                        <td
                          colSpan="4"
                          className="px-6 py-8 text-center text-gray-500"
                        >
                          No staff members found matching your search criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            {isLoading ? (
              <div className="sm:hidden flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600 font-medium">
                  Loading staff data...
                </p>
              </div>
            ) : (
              <div className="block sm:hidden">
                <div className="space-y-4 p-4">
                  {departmentData.staffMembers
                    .filter((staff) => {
                      const matchesName =
                        searchQuery === "" ||
                        staff.name
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase());
                      const matchesProject =
                        projectSearchQuery === "" ||
                        (staff.projectName &&
                          staff.projectName
                            .toLowerCase()
                            .includes(projectSearchQuery.toLowerCase()));
                      return matchesName && matchesProject;
                    })
                    .map((staff) => (
                      <div
                        key={staff.id}
                        className="bg-white rounded-lg border border-blue-200 p-4 shadow-sm"
                      >
                        <div className="flex items-center mb-3">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center mr-3">
                            <span className="text-lg font-bold text-white">
                              {staff.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {staff.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {staff.email}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-600">
                              Project Name:
                            </span>
                            <span className="text-sm text-gray-900">
                              {staff.projectName || "N/A"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-600">
                              Total Given:
                            </span>
                            <span className="text-sm text-gray-900">
                              {staff.pendingTasks + staff.completedTasks}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-600">
                              Completed Tasks:
                            </span>
                            <span className="px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
                              {staff.completedTasks}
                            </span>
                          </div>


                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-600">
                              Pending Tasks:
                            </span>
                            <span className="px-3 py-1 text-sm font-semibold rounded-full bg-amber-100 text-amber-800">
                              {staff.pendingTasks}
                            </span>
                          </div>

                          

                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-600">
                              Overdue Tasks:
                            </span>
                            <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                              {staff.overdueTasks || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  {departmentData.staffMembers.filter((staff) => {
                    const matchesName =
                      searchQuery === "" ||
                      staff.name
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase());
                    const matchesProject =
                      projectSearchQuery === "" ||
                      (staff.projectName &&
                        staff.projectName
                          .toLowerCase()
                          .includes(projectSearchQuery.toLowerCase()));
                    return matchesName && matchesProject;
                  }).length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No staff members found matching your search criteria.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
