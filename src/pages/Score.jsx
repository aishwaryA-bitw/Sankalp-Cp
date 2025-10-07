"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Search, Award } from "lucide-react"
import AdminLayout from "../components/layout/AdminLayout"

// Configuration object
const CONFIG = {
  // Google Apps Script URL
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxSZcOMQh4CIB2NfPQWaV5rrnxodzYXTXuyo3ezWXaImwED4KB5n9PVdU7Vka8JWFe6/exec",

  // Sheet ID
  SHEET_ID: "1TSHYw5iEMj1_K1oeVjqMcG6uQRVHQ3Ejj2W0IimJmpg",

  // Sheet name
  SCORING_SHEET_NAME: "Scoring",

  // Page configuration
  PAGE_CONFIG: {
    title: "Score Management",
    description: "Employee scoring records and performance metrics",
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

function Score() {
  const [scoringData, setScoringData] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userRole, setUserRole] = useState("")
  const [username, setUsername] = useState("")

  // Debounced search term for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  useEffect(() => {
    const role = sessionStorage.getItem("role")
    const user = sessionStorage.getItem("username")
    setUserRole(role || "")
    setUsername(user || "")
  }, [])

  // Function to format date values properly
  const formatDateValue = useCallback((value) => {
    if (!value) return ""

    // If it's a datetime string, extract just the date part
    if (typeof value === "string" && value.includes("T")) {
      try {
        const date = new Date(value)
        // Format as DD/MM/YYYY
        const day = date.getDate().toString().padStart(2, "0")
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear()
        return `${day}/${month}/${year}`
      } catch (error) {
        return value
      }
    }

    return value
  }, [])

  // Function to process scoring data
  const processScoringData = useCallback((data) => {
    const processedData = []

    let rows = []
    if (data.table && data.table.rows) {
      rows = data.table.rows
    } else if (Array.isArray(data)) {
      rows = data
    } else if (data.values) {
      rows = data.values.map((row) => ({ c: row.map((val) => ({ v: val })) }))
    }

    // Start fetching data from row 4 (index 3 in 0-based indexing)
    const startRowIndex = 3

    rows.forEach((row, rowIndex) => {
      // Skip rows before row 4
      if (rowIndex < startRowIndex) return

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

      // Skip empty rows
      if (rowValues.every(val => !val || val.toString().trim() === "")) {
        return
      }

      const googleSheetsRowIndex = rowIndex + 1
      const name = rowValues[2] || ""
      const stableId = name
        ? `score_${name}_${googleSheetsRowIndex}`
        : `score_row_${googleSheetsRowIndex}_${Math.random().toString(36).substring(2, 15)}`

      const rowData = {
        _id: stableId,
        _rowIndex: googleSheetsRowIndex,
        startDate: formatDateValue(rowValues[0]) || "",
        endDate: formatDateValue(rowValues[1]) || "",
        name: rowValues[2] || "",
        target: rowValues[3] || "",
        achievement: rowValues[4] || "",
        overallScoreWorkNotDone: rowValues[5] || "",
        overallScoreWorkNotDoneOnTime: rowValues[6] || "",
        totalPending: rowValues[7] || "",
      }

      processedData.push(rowData)
    })

    return processedData
  }, [formatDateValue])

  // Optimized data fetching
  const fetchScoringData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?sheet=${CONFIG.SCORING_SHEET_NAME}&action=fetch`)

      if (response.ok) {
        const responseText = await response.text()
        let data
        try {
          data = JSON.parse(responseText)
        } catch (parseError) {
          const jsonStart = responseText.indexOf("{")
          const jsonEnd = responseText.lastIndexOf("}")
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = responseText.substring(jsonStart, jsonEnd + 1)
            data = JSON.parse(jsonString)
          } else {
            throw new Error("Invalid JSON response from scoring sheet")
          }
        }

        const processedData = processScoringData(data)
        setScoringData(processedData)
      } else {
        console.error("Failed to fetch scoring data:", response.status)
        setError("Failed to fetch scoring data")
      }

      setLoading(false)
    } catch (error) {
      console.error("Error fetching scoring data:", error)
      setError("Failed to load scoring data: " + error.message)
      setLoading(false)
    }
  }, [processScoringData])

  useEffect(() => {
    fetchScoringData()
  }, [fetchScoringData])

  // Optimized filtered data with debounced search
  const filteredScoringData = useMemo(() => {
    const filtered = debouncedSearchTerm
      ? scoringData.filter((record) =>
        Object.values(record).some(
          (value) => value && value.toString().toLowerCase().includes(debouncedSearchTerm.toLowerCase()),
        ),
      )
      : scoringData

    return filtered
  }, [scoringData, debouncedSearchTerm])

  // Function to get score percentage color
  const getScorePercentageColor = useCallback((percentage) => {
    const num = parseFloat(percentage)
    if (isNaN(num)) return "text-gray-600"
    if (num >= 80) return "text-green-600 font-semibold"
    if (num >= 60) return "text-yellow-600 font-semibold"
    return "text-red-600 font-semibold"
  }, [])

  // Function to get achievement vs target color
  const getAchievementColor = useCallback((target, achievement) => {
    const targetNum = parseFloat(target)
    const achievementNum = parseFloat(achievement)

    if (isNaN(targetNum) || isNaN(achievementNum)) return "text-gray-600"

    const percentage = (achievementNum / targetNum) * 100
    if (percentage >= 100) return "text-green-600 font-semibold"
    if (percentage >= 80) return "text-yellow-600 font-semibold"
    return "text-red-600 font-semibold"
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
                placeholder="Search by name, target, achievement..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-4">
            <div className="flex items-center">
              <Award className="h-5 w-5 mr-2 text-purple-600" />
              <h2 className="text-purple-700 font-medium">Employee Scoring Records</h2>
            </div>
            <p className="text-purple-600 text-sm mt-1">
              {CONFIG.PAGE_CONFIG.description}
            </p>
            <div className="mt-2 text-sm text-purple-600">
              Total Records: <span className="font-semibold">{filteredScoringData.length}</span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-4"></div>
              <p className="text-purple-600">Loading scoring data...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md text-red-800 text-center">
              {error}{" "}
              <button className="underline ml-2" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          ) : (

            <>
            {/* Scoring Table */}
           <div className="hidden sm:flex overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Start Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      End Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Achievement
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overall Score % Work Not Done
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overall Score % Work Not Done On Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Pending
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredScoringData.length > 0 ? (
                    filteredScoringData.map((record) => (
                      <tr key={record._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.startDate || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.endDate || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{record.name || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.target || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${getAchievementColor(record.target, record.achievement)}`}>
                            {record.achievement || "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${getScorePercentageColor(record.overallScoreWorkNotDone)}`}>
                            {record.overallScoreWorkNotDone ? `${record.overallScoreWorkNotDone}%` : "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${getScorePercentageColor(record.overallScoreWorkNotDoneOnTime)}`}>
                            {record.overallScoreWorkNotDoneOnTime ? `${record.overallScoreWorkNotDoneOnTime}%` : "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.totalPending || "—"}</div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                        {searchTerm
                          ? "No scoring records matching your search"
                          : "No scoring records found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>


                  <div className="sm:hidden overflow-x-auto">
  {filteredScoringData.length > 0 ? (
    filteredScoringData.map((record) => (
      <div
        key={record._id}
        className="bg-white rounded-lg shadow-md border-2 mb-4 overflow-hidden"
      >
        {/* Header Section */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-3 border-b border-purple-200">
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="text-xs font-medium text-purple-600">Name:</span>
              <p className="text-sm font-bold text-gray-900">
                {record.name || "—"}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-purple-600">Total Pending:</span>
              <p className="text-sm font-semibold text-gray-900">
                {record.totalPending || "—"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Start Date:</span>
              <p className="font-medium text-gray-900">{record.startDate || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">End Date:</span>
              <p className="font-medium text-gray-900">{record.endDate || "—"}</p>
            </div>
          </div>
        </div>

        {/* Target & Achievement Section */}
        <div className="p-3 bg-blue-50 border-b border-blue-100">
          <span className="text-xs font-semibold text-blue-700 uppercase mb-2 block">
            Target & Achievement
          </span>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-600 font-medium">Target:</span>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {record.target || "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-600 font-medium">Achievement:</span>
              <p className={`text-sm font-semibold mt-1 ${getAchievementColor(record.target, record.achievement)}`}>
                {record.achievement || "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Score Performance Section */}
        <div className="p-3 bg-yellow-50">
          <span className="text-xs font-semibold text-yellow-700 uppercase mb-2 block">
            Performance Scores
          </span>
          <div className="grid grid-cols-1 gap-3 text-xs">
            <div>
              <span className="text-gray-600 font-medium">Work Not Done:</span>
              <p className={`text-sm font-semibold mt-1 ${getScorePercentageColor(record.overallScoreWorkNotDone)}`}>
                {record.overallScoreWorkNotDone ? `${record.overallScoreWorkNotDone}%` : "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-600 font-medium">Work Not Done On Time:</span>
              <p className={`text-sm font-semibold mt-1 ${getScorePercentageColor(record.overallScoreWorkNotDoneOnTime)}`}>
                {record.overallScoreWorkNotDoneOnTime ? `${record.overallScoreWorkNotDoneOnTime}%` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    ))
  ) : (
    <div className="px-6 py-4 text-center text-gray-500">
      {searchTerm
        ? "No scoring records matching your search"
        : "No scoring records found"}
    </div>
  )}
</div>
            </>
          )}
        </div>

        {/* Summary Stats */}
        {/* {!loading && !error && filteredScoringData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Total Records</div>
              <div className="text-2xl font-bold text-gray-900">{filteredScoringData.length}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">High Performers</div>
              <div className="text-2xl font-bold text-green-600">
                {filteredScoringData.filter(record => {
                  const target = parseFloat(record.target)
                  const achievement = parseFloat(record.achievement)
                  if (isNaN(target) || isNaN(achievement)) return false
                  return (achievement / target) * 100 >= 100
                }).length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Average Performers</div>
              <div className="text-2xl font-bold text-yellow-600">
                {filteredScoringData.filter(record => {
                  const target = parseFloat(record.target)
                  const achievement = parseFloat(record.achievement)
                  if (isNaN(target) || isNaN(achievement)) return false
                  const percentage = (achievement / target) * 100
                  return percentage >= 80 && percentage < 100
                }).length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Below Target</div>
              <div className="text-2xl font-bold text-red-600">
                {filteredScoringData.filter(record => {
                  const target = parseFloat(record.target)
                  const achievement = parseFloat(record.achievement)
                  if (isNaN(target) || isNaN(achievement)) return false
                  return (achievement / target) * 100 < 80
                }).length}
              </div>
            </div>
          </div>
        )} */}
      </div>
    </AdminLayout>
  )
}

export default Score