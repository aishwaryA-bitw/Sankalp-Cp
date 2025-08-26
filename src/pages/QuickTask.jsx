"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { CheckCircle2, Upload, X, Search, Calendar } from "lucide-react"
import AdminLayout from "../components/layout/AdminLayout"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

// Configuration object
const CONFIG = {
  // Google Apps Script URL
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxSZcOMQh4CIB2NfPQWaV5rrnxodzYXTXuyo3ezWXaImwED4KB5n9PVdU7Vka8JWFe6/exec",

  // Sheet ID
  SHEET_ID: "1TSHYw5iEMj1_K1oeVjqMcG6uQRVHQ3Ejj2W0IimJmpg",

  // Sheet name
  SHEET_NAME: "Unique Task",

  // Page configuration
  PAGE_CONFIG: {
    title: "Quick Tasks",
    description: "Showing all Quick tasks",
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

function QuickTask() {
  const [accountData, setAccountData] = useState([])
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [additionalData, setAdditionalData] = useState({})
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [remarksData, setRemarksData] = useState({})
  const [statusData, setStatusData] = useState({})
  const [nextTargetDate, setNextTargetDate] = useState({})
  const [userRole, setUserRole] = useState("")
  const [username, setUsername] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Debounced search term for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  const formatDateToDDMMYYYY = useCallback((date) => {
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }, [])

  const isEmpty = useCallback((value) => {
    return value === null || value === undefined || (typeof value === "string" && value.trim() === "")
  }, [])

  useEffect(() => {
    const role = sessionStorage.getItem("role")
    const user = sessionStorage.getItem("username")
    setUserRole(role || "")
    setUsername(user || "")
  }, [])

  const parseGoogleSheetsDate = useCallback(
    (dateStr) => {
      if (!dateStr) return ""

      // If it's already in DD/MM/YYYY format, return as is
      if (typeof dateStr === "string" && dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        // Ensure proper padding for DD/MM/YYYY format
        const parts = dateStr.split("/")
        if (parts.length === 3) {
          const day = parts[0].padStart(2, "0")
          const month = parts[1].padStart(2, "0")
          const year = parts[2]
          return `${day}/${month}/${year}`
        }
        return dateStr
      }

      // Handle Google Sheets Date() format
      if (typeof dateStr === "string" && dateStr.startsWith("Date(")) {
        const match = /Date\((\d+),(\d+),(\d+)\)/.exec(dateStr)
        if (match) {
          const year = Number.parseInt(match[1], 10)
          const month = Number.parseInt(match[2], 10)
          const day = Number.parseInt(match[3], 10)
          return `${day.toString().padStart(2, "0")}/${(month + 1).toString().padStart(2, "0")}/${year}`
        }
      }

      // Handle other date formats
      try {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          return formatDateToDDMMYYYY(date)
        }
      } catch (error) {
        console.error("Error parsing date:", error)
      }

      // If all else fails, return the original string
      return dateStr
    },
    [formatDateToDDMMYYYY],
  )

  const formatDateForDisplay = useCallback(
    (dateStr) => {
      if (!dateStr) return "—"

      // If it's already in proper DD/MM/YYYY format, return as is
      if (typeof dateStr === "string" && typeof dateStr === "string" && dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        return dateStr
      }

      // Try to parse and reformat
      return parseGoogleSheetsDate(dateStr) || "—"
    },
    [parseGoogleSheetsDate],
  )

  // Enhanced date comparison function
  const isDateInRange = useCallback((dateStr, start, end) => {
    if (!dateStr || dateStr === "—") return false;
    
    try {
      // Parse the date string (DD/MM/YYYY format)
      const dateParts = dateStr.split('/');
      if (dateParts.length !== 3) return false;
      
      const [day, month, year] = dateParts.map(Number);
      const date = new Date(year, month - 1, day);
      
      // Validate the parsed date
      if (isNaN(date.getTime())) return false;
      
      // Check start date
      if (start && start.trim()) {
        const startParts = start.split('/');
        if (startParts.length === 3) {
          const [startDay, startMonth, startYear] = startParts.map(Number);
          const startDate = new Date(startYear, startMonth - 1, startDay);
          if (!isNaN(startDate.getTime()) && date < startDate) return false;
        }
      }
      
      // Check end date
      if (end && end.trim()) {
        const endParts = end.split('/');
        if (endParts.length === 3) {
          const [endDay, endMonth, endYear] = endParts.map(Number);
          const endDate = new Date(endYear, endMonth - 1, endDay);
          if (!isNaN(endDate.getTime()) && date > endDate) return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error("Error comparing dates:", error);
      return false;
    }
  }, []);

  // Optimized filtered data with debounced search and date range
  const filteredAccountData = useMemo(() => {
    let filtered = accountData;
    
    // Apply date range filter first
    if (startDate || endDate) {
      filtered = filtered.filter((account) => 
        isDateInRange(account["col0"], startDate, endDate)
      );
    }
    
    // Apply search filter
    if (debouncedSearchTerm) {
      filtered = filtered.filter((account) =>
        Object.values(account).some(
          (value) => value && value.toString().toLowerCase().includes(debouncedSearchTerm.toLowerCase()),
        ),
      )
    }

    return filtered;
  }, [accountData, debouncedSearchTerm, startDate, endDate, isDateInRange])

  // Data fetching
  const fetchSheetData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?sheet=${CONFIG.SHEET_NAME}&action=fetch`)

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`)
      }

      // Process main data
      const text = await response.text()
      let data
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        const jsonStart = text.indexOf("{")
        const jsonEnd = text.lastIndexOf("}")
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = text.substring(jsonStart, jsonEnd + 1)
          data = JSON.parse(jsonString)
        } else {
          throw new Error("Invalid JSON response from server")
        }
      }

      // Process data
      const currentUsername = sessionStorage.getItem("username")
      const currentUserRole = sessionStorage.getItem("role")

      const pendingAccounts = []

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
          rowValues = row.c.map((cell) => (cell && cell.v !== undefined ? cell.v : ""))
        } else if (Array.isArray(row)) {
          rowValues = row
        } else {
          return
        }

        const googleSheetsRowIndex = rowIndex + 1
        const taskId = rowValues[1] || ""
        const stableId = taskId
          ? `task_${taskId}_${googleSheetsRowIndex}`
          : `row_${googleSheetsRowIndex}_${Math.random().toString(36).substring(2, 15)}`

        const rowData = {
          _id: stableId,
          _rowIndex: googleSheetsRowIndex,
          _taskId: taskId,
        }

        // Map columns as requested
        // Date (A/0), Project (B/1), Given By (C/2), Name (D/3), 
        // Task Description (E/4), Task Start Date (F/5), 
        // Freq (G/6), Enable Reminders (H/7), Require Attachment (I/8)
        rowData["col0"] = rowValues[0] ? parseGoogleSheetsDate(String(rowValues[0])) : "" // Date
        rowData["col1"] = rowValues[1] || "" // Project
        rowData["col2"] = rowValues[2] || "" // Given By
        rowData["col3"] = rowValues[3] || "" // Name
        rowData["col4"] = rowValues[4] || "" // Task Description
        rowData["col5"] = rowValues[5] ? parseGoogleSheetsDate(String(rowValues[5])) : "" // Task Start Date
        rowData["col6"] = rowValues[6] || "" // Freq
        rowData["col7"] = rowValues[7] || "" // Enable Reminders
        rowData["col8"] = rowValues[8] || "" // Require Attachment

        pendingAccounts.push(rowData)
      })

      setAccountData(pendingAccounts)
      setLoading(false)
    } catch (error) {
      console.error("Error fetching sheet data:", error)
      setError("Failed to load account data: " + error.message)
      setLoading(false)
    }
  }, [parseGoogleSheetsDate])

  useEffect(() => {
    fetchSheetData()
  }, [fetchSheetData])

  const handleSelectItem = useCallback((id, isChecked) => {
    setSelectedItems((prev) => {
      const newSelected = new Set(prev)

      if (isChecked) {
        newSelected.add(id)
        setStatusData((prevStatus) => ({ ...prevStatus, [id]: "Done" }))
      } else {
        newSelected.delete(id)
        setAdditionalData((prevData) => {
          const newAdditionalData = { ...prevData }
          delete newAdditionalData[id]
          return newAdditionalData
        })
        setRemarksData((prevRemarks) => {
          const newRemarksData = { ...prevRemarks }
          delete newRemarksData[id]
          return newRemarksData
        })
        setStatusData((prevStatus) => {
          const newStatusData = { ...prevStatus }
          delete newStatusData[id]
          return newStatusData
        })
        setNextTargetDate((prevDate) => {
          const newDateData = { ...prevDate }
          delete newDateData[id]
          return newDateData
        })
      }

      return newSelected
    })
  }, [])

  const handleCheckboxClick = useCallback(
    (e, id) => {
      e.stopPropagation()
      const isChecked = e.target.checked
      handleSelectItem(id, isChecked)
    },
    [handleSelectItem],
  )

  const handleSelectAllItems = useCallback(
    (e) => {
      e.stopPropagation()
      const checked = e.target.checked

      if (checked) {
        const allIds = filteredAccountData.map((item) => item._id)
        setSelectedItems(new Set(allIds))

        const newStatusData = {}
        allIds.forEach((id) => {
          newStatusData[id] = "Done"
        })
        setStatusData((prev) => ({ ...prev, ...newStatusData }))
      } else {
        setSelectedItems(new Set())
        setAdditionalData({})
        setRemarksData({})
        setStatusData({})
        setNextTargetDate({})
      }
    },
    [filteredAccountData],
  )

  const handleImageUpload = useCallback(async (id, e) => {
    const file = e.target.files[0]
    if (!file) return

    setAccountData((prev) => prev.map((item) => (item._id === id ? { ...item, image: file } : item)))
  }, [])

  const handleStatusChange = useCallback((id, value) => {
    setStatusData((prev) => ({ ...prev, [id]: value }))
    if (value === "Done") {
      setNextTargetDate((prev) => {
        const newDates = { ...prev }
        delete newDates[id]
        return newDates
      })
    }
  }, [])

  const handleNextTargetDateChange = useCallback((id, value) => {
    setNextTargetDate((prev) => ({ ...prev, [id]: value }))
  }, [])

  // Function to clear date filters
  const clearDateFilters = () => {
    setStartDate("")
    setEndDate("")
  }

  const selectedItemsCount = selectedItems.size

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        {/* STICKY HEADER SECTION */}
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <h1 className="text-2xl font-bold tracking-tight text-purple-700">
                {CONFIG.PAGE_CONFIG.title}
              </h1>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                {/* Date Range Selector */}
                {/* Date Range Selector */}
<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
  <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Date Range:</span>
  <div className="flex items-center gap-2">
    {/* Start Date */}
    <div className="relative">
      <Calendar
        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
        size={16}
      />
      <DatePicker
        selected={startDate ? new Date(startDate.split("/").reverse().join("-")) : null}
        onChange={(date) =>
          setStartDate(date ? formatDateToDDMMYYYY(date) : "")
        }
        dateFormat="dd/MM/yyyy"
        placeholderText="DD/MM/YYYY"
        className="pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 w-32 text-sm"
      />
    </div>

    <span className="text-gray-500 text-sm">to</span>

    {/* End Date */}
    <div className="relative">
      <Calendar
        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
        size={16}
      />
      <DatePicker
        selected={endDate ? new Date(endDate.split("/").reverse().join("-")) : null}
        onChange={(date) =>
          setEndDate(date ? formatDateToDDMMYYYY(date) : "")
        }
        dateFormat="dd/MM/yyyy"
        placeholderText="DD/MM/YYYY"
        className="pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 w-32 text-sm"
      />
    </div>

    {(startDate || endDate) && (
      <button
        onClick={clearDateFilters}
        className="text-purple-600 hover:text-purple-800 text-sm underline"
      >
        Clear
      </button>
    )}
  </div>
</div>

                
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 w-64"
                  />
                </div>
              </div>
            </div>
            
            {/* Filter Status Display */}
            {(startDate || endDate || debouncedSearchTerm) && (
              <div className="mt-3 text-sm text-purple-600">
                Showing {filteredAccountData.length} task{filteredAccountData.length !== 1 ? 's' : ''}
                {startDate && ` from ${startDate}`}
                {endDate && ` to ${endDate}`}
                {debouncedSearchTerm && ` matching "${debouncedSearchTerm}"`}
              </div>
            )}
          </div>
        </div>

        {/* MAIN CONTENT SECTION - SCROLLABLE */}
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          {successMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md flex items-center justify-between mb-6">
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
                {successMessage}
              </div>
              <button onClick={() => setSuccessMessage("")} className="text-green-500 hover:text-green-700">
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          <div className="rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-4">
              <h2 className="text-purple-700 font-medium">
                Pending {CONFIG.SHEET_NAME} Tasks
              </h2>
              <p className="text-purple-600 text-sm">
                {CONFIG.PAGE_CONFIG.description}
              </p>
            </div>

            {loading ? (
              <div className="text-center py-10">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-4"></div>
                <p className="text-purple-600">Loading task data...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 p-4 rounded-md text-red-800 text-center">
                {error}{" "}
                <button className="underline ml-2" onClick={() => window.location.reload()}>
                  Try again
                </button>
              </div>
            ) : (
              /* Regular Tasks Table */
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          checked={filteredAccountData.length > 0 && selectedItems.size === filteredAccountData.length}
                          onChange={handleSelectAllItems}
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Given By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Task Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Task Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Freq
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Enable Reminders
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Require Attachment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAccountData.length > 0 ? (
                      filteredAccountData.map((account) => {
                        const isSelected = selectedItems.has(account._id)
                        return (
                          <tr
                            key={account._id}
                            className={`${isSelected ? "bg-purple-50" : ""} hover:bg-gray-50`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                checked={isSelected}
                                onChange={(e) => handleCheckboxClick(e, account._id)}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{formatDateForDisplay(account["col0"])}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{account["col1"] || "—"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{account["col2"] || "—"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{account["col3"] || "—"}</div>
                            </td>
                            <td className="px-6 py-4 min-w-[250px]">
                              <div
                                className="text-sm text-gray-900 max-w-md whitespace-normal break-words"
                                title={account["col4"]}
                              >
                                {account["col4"] || "—"}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{formatDateForDisplay(account["col5"])}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{account["col6"] || "—"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{account["col7"] || "—"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{account["col8"] || "—"}</div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={10} className="px-6 py-4 text-center text-gray-500">
                          {searchTerm || startDate || endDate ? "No tasks matching your filters" : "No pending tasks found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export default QuickTask