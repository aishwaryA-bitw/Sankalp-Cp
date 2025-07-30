"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Search, Users, Building2 } from "lucide-react"
import AdminLayout from "../components/layout/AdminLayout"

// Configuration object
const CONFIG = {
  // Google Apps Script URL
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxSZcOMQh4CIB2NfPQWaV5rrnxodzYXTXuyo3ezWXaImwED4KB5n9PVdU7Vka8JWFe6/exec",

  // Sheet ID
  SHEET_ID: "1TSHYw5iEMj1_K1oeVjqMcG6uQRVHQ3Ejj2W0IimJmpg",

  // Sheet names
  OFFICE_SHEET_NAME: "Office Attendance",
  SITE_SHEET_NAME: "Site Attendance",

  // Page configuration
  PAGE_CONFIG: {
    title: "Attendance Management",
    // officeDescription: "Office attendance records and statistics",
    // siteDescription: "Site attendance records and statistics",
  },
}

// Debounce hook for search optimization
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

function Attendance() {
  const [officeAttendanceData, setOfficeAttendanceData] = useState([])
  const [siteAttendanceData, setSiteAttendanceData] = useState([])
  const [activeTab, setActiveTab] = useState("office")
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userRole, setUserRole] = useState("")
  const [username, setUsername] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("All")

  // Debounced search term for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  useEffect(() => {
    const role = sessionStorage.getItem("role")
    const user = sessionStorage.getItem("username")
    setUserRole(role || "")
    setUsername(user || "")
  }, [])

  // Function to format time values properly
  const formatTimeValue = useCallback((value) => {
    if (!value) return ""

    // If it's a datetime string, extract just the time part
    if (typeof value === "string" && value.includes("T")) {
      try {
        const date = new Date(value)
        // Extract hours and minutes
        const hours = date.getUTCHours().toString().padStart(2, "0")
        const minutes = date.getUTCMinutes().toString().padStart(2, "0")
        return `${hours}:${minutes}`
      } catch (error) {
        return value
      }
    }

    return value
  }, [])

  // Function to process attendance data
  const processAttendanceData = useCallback((data, sheetType) => {
    const processedData = []

    let rows = []
    if (data.table && data.table.rows) {
      rows = data.table.rows
    } else if (Array.isArray(data)) {
      rows = data
    } else if (data.values) {
      rows = data.values.map((row) => ({ c: row.map((val) => ({ v: val })) }))
    }

    rows.forEach((row, rowIndex) => {
      if (rowIndex === 0) return // Skip header row

      let rowValues = []
      if (row.c) {
        // Get both formatted value (f) and raw value (v) for better handling
        rowValues = row.c.map((cell) => {
          if (cell && cell.f !== undefined) {
            return cell.f // Use formatted value if available
          } else if (cell && cell.v !== undefined) {
            return cell.v // Otherwise use raw value
          } else {
            return ""
          }
        })
      } else if (Array.isArray(row)) {
        rowValues = row
      } else {
        return
      }

      const googleSheetsRowIndex = rowIndex + 1
      const employeeCode = rowValues[0] || ""
      const stableId = employeeCode
        ? `${sheetType}_${employeeCode}_${googleSheetsRowIndex}`
        : `${sheetType}_row_${googleSheetsRowIndex}_${Math.random().toString(36).substring(2, 15)}`

      const rowData = {
        _id: stableId,
        _rowIndex: googleSheetsRowIndex,
        _sheetType: sheetType,
        employeeCode: rowValues[0] || "",
        name: rowValues[1] || "",
        totalPunch: rowValues[2] || "",
        inTime: formatTimeValue(rowValues[3]) || "",
        outTime: formatTimeValue(rowValues[4]) || "",
        punchMiss: rowValues[5] || "",
        inLate: formatTimeValue(rowValues[6]) || "",
        outLate: formatTimeValue(rowValues[7]) || "",
        totalDays: rowValues[8] || "",
        late: formatTimeValue(rowValues[9]) || "",
        monthName: rowValues[10] || "",
        weeklyLatePercent: rowValues[11] || "",
        monthlyLatePercent: rowValues[12] || "",
      }

      processedData.push(rowData)
    })

    return processedData
  }, [formatTimeValue])

  // Optimized data fetching with parallel requests
  const fetchAttendanceData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Parallel fetch both sheets for better performance
      const [officeResponse, siteResponse] = await Promise.all([
        fetch(`${CONFIG.APPS_SCRIPT_URL}?sheet=${CONFIG.OFFICE_SHEET_NAME}&action=fetch`),
        fetch(`${CONFIG.APPS_SCRIPT_URL}?sheet=${CONFIG.SITE_SHEET_NAME}&action=fetch`),
      ])

      // Process office attendance data
      if (officeResponse.ok) {
        const officeText = await officeResponse.text()
        let officeData
        try {
          officeData = JSON.parse(officeText)
        } catch (parseError) {
          const jsonStart = officeText.indexOf("{")
          const jsonEnd = officeText.lastIndexOf("}")
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = officeText.substring(jsonStart, jsonEnd + 1)
            officeData = JSON.parse(jsonString)
          } else {
            throw new Error("Invalid JSON response from office attendance sheet")
          }
        }

        const processedOfficeData = processAttendanceData(officeData, "office")
        setOfficeAttendanceData(processedOfficeData)
      } else {
        console.error("Failed to fetch office attendance data:", officeResponse.status)
      }

      // Process site attendance data
      if (siteResponse.ok) {
        const siteText = await siteResponse.text()
        let siteData
        try {
          siteData = JSON.parse(siteText)
        } catch (parseError) {
          const jsonStart = siteText.indexOf("{")
          const jsonEnd = siteText.lastIndexOf("}")
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = siteText.substring(jsonStart, jsonEnd + 1)
            siteData = JSON.parse(jsonString)
          } else {
            throw new Error("Invalid JSON response from site attendance sheet")
          }
        }

        const processedSiteData = processAttendanceData(siteData, "site")
        setSiteAttendanceData(processedSiteData)
      } else {
        console.error("Failed to fetch site attendance data:", siteResponse.status)
      }

      setLoading(false)
    } catch (error) {
      console.error("Error fetching attendance data:", error)
      setError("Failed to load attendance data: " + error.message)
      setLoading(false)
    }
  }, [processAttendanceData])

  useEffect(() => {
    fetchAttendanceData()
  }, [fetchAttendanceData])

  // Get current data based on active tab
  const currentData = activeTab === "office" ? officeAttendanceData : siteAttendanceData

  // Get available months from current data
  const availableMonths = useMemo(() => {
    const months = new Set()
    currentData.forEach((record) => {
      if (record.monthName) {
        months.add(record.monthName)
      }
    })
    return Array.from(months).sort()
  }, [currentData])

  // Optimized filtered data with debounced search and month filter
  const filteredAttendanceData = useMemo(() => {
    let filtered = currentData

    // Apply search filter
    if (debouncedSearchTerm) {
      filtered = filtered.filter((record) =>
        Object.values(record).some(
          (value) => value && value.toString().toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        )
      )
    }

    // Apply month filter
    if (selectedMonth !== "All") {
      filtered = filtered.filter((record) => record.monthName === selectedMonth)
    }

    return filtered
  }, [currentData, debouncedSearchTerm, selectedMonth])

  // Function to get late percentage color
  const getLatePecentageColor = useCallback((percentage) => {
    const num = parseFloat(percentage)
    if (isNaN(num)) return "text-gray-600"
    if (num >= 20) return "text-red-600 font-semibold"
    if (num >= 10) return "text-yellow-600 font-semibold"
    return "text-green-600"
  }, [])

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold tracking-tight text-purple-700">
            {CONFIG.PAGE_CONFIG.title}
          </h1>

          <div className="flex space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by employee code, name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-3 pr-8 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="All">All Months</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => {
                setActiveTab("office")
                setSelectedMonth("All")
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === "office"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
            >
              <Building2 className="h-4 w-4 mr-2" />
              Office Attendance
              <span className="ml-2 bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                {activeTab === "office" ? filteredAttendanceData.length : officeAttendanceData.length}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab("site")
                setSelectedMonth("All")
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === "site"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
            >
              <Users className="h-4 w-4 mr-2" />
              Site Attendance
              <span className="ml-2 bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                {activeTab === "site" ? filteredAttendanceData.length : siteAttendanceData.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-4">
            <h2 className="text-purple-700 font-medium">
              {activeTab === "office" ? "Office Attendance Records" : "Site Attendance Records"}
            </h2>
            <p className="text-purple-600 text-sm">
              {activeTab === "office"
                ? CONFIG.PAGE_CONFIG.officeDescription
                : CONFIG.PAGE_CONFIG.siteDescription}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-4"></div>
              <p className="text-purple-600">Loading attendance data...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md text-red-800 text-center">
              {error}{" "}
              <button className="underline ml-2" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          ) : (
            /* Attendance Table */
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Punch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      In Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Out Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Punch Miss
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      In Late
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Out Late
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Days
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Late
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Month Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Weekly Late %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Monthly Late %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAttendanceData.length > 0 ? (
                    filteredAttendanceData.map((record) => (
                      <tr key={record._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{record.employeeCode || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.name || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.totalPunch || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.inTime || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.outTime || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.punchMiss || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.inLate || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.outLate || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.totalDays || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.late || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.monthName || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${getLatePecentageColor(record.weeklyLatePercent)}`}>
                            {record.weeklyLatePercent ? `${record.weeklyLatePercent}%` : "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${getLatePecentageColor(record.monthlyLatePercent)}`}>
                            {record.monthlyLatePercent ? `${record.monthlyLatePercent}%` : "—"}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={13} className="px-6 py-4 text-center text-gray-500">
                        {searchTerm || selectedMonth !== "All"
                          ? "No attendance records matching your filters"
                          : `No ${activeTab} attendance records found`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {/* {!loading && !error && filteredAttendanceData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Total Records</div>
              <div className="text-2xl font-bold text-gray-900">{filteredAttendanceData.length}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">High Late %</div>
              <div className="text-2xl font-bold text-red-600">
                {filteredAttendanceData.filter(record =>
                  parseFloat(record.monthlyLatePercent) >= 20
                ).length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Medium Late %</div>
              <div className="text-2xl font-bold text-yellow-600">
                {filteredAttendanceData.filter(record => {
                  const percent = parseFloat(record.monthlyLatePercent)
                  return percent >= 10 && percent < 20
                }).length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Good Attendance</div>
              <div className="text-2xl font-bold text-green-600">
                {filteredAttendanceData.filter(record =>
                  parseFloat(record.monthlyLatePercent) < 10
                ).length}
              </div>
            </div>
          </div>
        )} */}
      </div>
    </AdminLayout>
  )
}

export default Attendance