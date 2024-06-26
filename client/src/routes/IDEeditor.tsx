import React, { useEffect, useState } from "react"
import { Toaster, toast } from "react-hot-toast"
import { useNavigate, useParams } from "react-router-dom"
import { Buffer } from "buffer"

import { Layout, Model } from "flexlayout-react"
import "flexlayout-react/style/light.css"

import { Socket } from "socket.io-client"
import axios from "axios"

import 'bootstrap/dist/css/bootstrap.min.css';

import InputConsole from "./utils/InputConsole"
import OutputConsole from "./utils/OutputConsole"
import { BiExport, BiImport } from "react-icons/bi"
import Editor from "./utils/Editor"

export default function IDEeditor({ socket }: { socket: Socket }) {
    const navigate = useNavigate()
    const { roomId } = useParams()
    const [fetchedUsers, setFetchedUsers] = useState<string[]>([])
    const [fetchedCode, setFetchedCode] = useState<string>("")
    const [language, setLanguage] = useState<string>("java")
    const [codeKeybinding, setCodeKeybinding] = useState<string | undefined>(undefined)
    const [currentInput, setCurrentInput] = useState("")
    const [currentOutput, setCurrentOutput] = useState("")

    const languagesAvailable = ["javascript", "java", "c_cpp", "python", "typescript", "golang", "yaml", "html"]
    const codeKeybindingsAvailable = ["default", "emacs", "vim"]

    function onChange(newValue: string) {
        setFetchedCode(newValue)
        socket.emit("update code", { roomId, code: newValue })
        socket.emit("syncing the code", { roomId: roomId })
    }

    function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
        setLanguage(e.target.value)
        socket.emit("update language", { roomId, languageUsed: e.target.value })
        socket.emit("syncing the language", { roomId: roomId })
    }

    function handleCodeKeybindingChange(e: React.ChangeEvent<HTMLSelectElement>) {
        setCodeKeybinding(e.target.value === "default" ? undefined : e.target.value)
    }

    function handleLeave() {
        socket.disconnect()
        !socket.connected && navigate("/", { replace: true, state: {} })
    }

    function copyToClipboard(text: string) {
        try {
            navigator.clipboard.writeText(text)
            toast.success("Room ID copied")
        } catch (exp) {
            console.error(exp)
        }
    }

    const languageIdMap: { [key: string]: number } = {
        javascript: 1,
        java: 5,
        c_cpp: 50,
        python: 71,
        typescript: 74,
        golang: 60,
        yaml: 104,
        html: 54,
    }

    useEffect(() => {
        socket.on("updating client list", ({ userslist }) => {
            setFetchedUsers(userslist)
        })

        socket.on("on language change", ({ languageUsed }) => {
            setLanguage(languageUsed)
        })

        socket.on("on code change", ({ code }) => {
            setFetchedCode(code)
        })

        socket.on("new member joined", ({ username }) => {
            toast(`${username} joined`)
        })

        socket.on("member left", ({ username }) => {
            toast(`${username} left`)
        })
        return () => {

        }
    }, [socket])

    //encoding user coe
    const encode = (str: any) => {
        return Buffer.from(str, "binary").toString("base64")
    }

    //decoding to readable format
    const decode = (str: any) => {
        return Buffer.from(str, "base64").toString()
    }

    //post submission through api
    const postSubmission = async (language_id: number, source_code: string, stdin: string) => {
        const options = {
            method: "POST",
            url: "https://judge0-ce.p.rapidapi.com/submissions",
            params: { base64_encoded: "true", fields: "*" },
            headers: {
                "content-type": "application/json",
                "Content-Type": "application/json",
                "X-RapidAPI-Key": "08f3459af4msh7f9b4fb3067649cp17442cjsnc000e564dcf9",
                "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
            },
            data: JSON.stringify({
                language_id: language_id,
                source_code: source_code,
                stdin: stdin,
            }),
        }

        const res = await axios.request(options)
        return res.data.token
    }

    //for output
    const getOutput = async (token: string): Promise<any> => {
        const options = {
            method: "GET",
            url: "https://judge0-ce.p.rapidapi.com/submissions/" + token,
            params: { base64_encoded: "true", fields: "*" },
            headers: {
                "X-RapidAPI-Key": "08f3459af4msh7f9b4fb3067649cp17442cjsnc000e564dcf9",
                "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
            },
        }

        const res = await axios.request(options)
        if (res.data.status_id <= 2) {
            const res2 = await getOutput(token)
            return res2.data
        }
        return res.data
    }

    //to run
    const runCode = async () => {
        const language_id = languageIdMap[language]
        const source_code = encode(fetchedCode)
        const stdin = encode(currentInput)

        const token = await postSubmission(language_id, source_code, stdin)

        const res = await getOutput(token)
        const status_name = res.status.description
        const decoded_output = decode(res.stdout ? res.stdout : "")
        const decoded_compile_output = decode(res.compile_output ? res.compile_output : "")
        const decoded_error = decode(res.stderr ? res.stderr : "")

        let final_output = ""
        if (res.status_id !== 3) {
            if (decoded_compile_output === "") {
                final_output = decoded_error
            } else {
                final_output = decoded_compile_output
            }
        } else {
            final_output = decoded_output
        }
        setCurrentOutput(status_name + "\n\n" + final_output)
    }

    //for input to read a file
    const getFile = (e: { target: any }, setState: any) => {
        const input = e.target
        if ("files" in input && input.files.length > 0) {
            placeFileContent(input.files[0], setState)
        }
    }

    const placeFileContent = (file: any, setState: (arg0: unknown) => void) => {
        readFileContent(file)
            .then((content) => {
                setState(content)
            })
            .catch((error) => console.log(error))
    }

    //to export user code
    const handleExport = () => {
        const data = `data:text/plain;charset=utf-8,${encodeURIComponent(fetchedCode)}`
        const anchor = document.createElement("a")
        anchor.href = data
        anchor.download = "code.txt"
        anchor.click()
    }

    //to read input file
    function readFileContent(file: Blob) {
        const reader = new FileReader()
        return new Promise<string>((resolve, reject) => {
            reader.onload = (event) => resolve(event.target?.result as string)
            reader.onerror = (error) => reject(error)
            reader.readAsText(file)
        })
    }

    //for flex layout
    const factory = (node: any) => {
        var component = node.getComponent()

        if (component === "ide") {
            return (
                <Editor
                    fetchedCode={fetchedCode}
                    onChange={onChange}
                    language={language}
                    codeKeybinding={codeKeybinding}
                />
            )
        }

        if (component === "input") {
            return <InputConsole currentInput={currentInput} setCurrentInput={setCurrentInput} getFile={getFile} />
        }
        if (component === "output") {
            return <OutputConsole currentOutput={currentOutput} />
        }

        if (component === "problem") {
            return (
                <textarea
                    className="p-2"
                    placeholder="problem description"
                    disabled={true}
                    style={{
                        height: "100%", // Dynamically adjust height based on content
                        width: "100%", // Set maximum width to container width
                        maxWidth: "100%", // Ensure textarea doesn't exceed container width
                        resize: "vertical", // Allow vertical resizing only
                    }}
                ></textarea>
            )
        }
    }

    var json: any = {
        global: {},
        borders: [],
        layout: {
            type: "row",
            weight: 100,
            children: [
                {
                    type: "tabset",
                    weight: 40,
                    children: [
                        {
                            type: "tab",
                            name: "Problem",
                            component: "problem",
                        },
                    ],
                },
                {
                    type: "tabset",
                    weight: 40,
                    children: [
                        {
                            type: "tab",
                            name: "Ide",
                            component: "ide",
                        },
                    ],
                },

                {
                    type: "row",
                    weight: 20,
                    children: [
                        {
                            type: "tabset",
                            enableClose: false,
                            active: false,
                            classNameTabStrip: "tabClass",
                            weight: 50,
                            children: [
                                {
                                    type: "tab",
                                    name: "Input",
                                    component: "input",
                                },
                            ],
                        },
                        {
                            type: "tabset",
                            enableClose: false,
                            weight: 50,
                            active: false,
                            classNameTabStrip: "tabClass",
                            children: [
                                {
                                    type: "tab",
                                    name: "Output",
                                    component: "output",
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    }

    const model = Model.fromJson(json)

    return (
        <div>
            <div className="container">
                <div className="row align-items-center">
                    <div className="col-lg-2"> {fetchedUsers.length} user connected </div>
                    <div className="col-lg-2">
                        <select
                            className="form-select languageField"
                            aria-label=".form-select-sm example"
                            name="language"
                            id="language"
                            value={language}
                            onChange={handleLanguageChange}
                        >
                            {languagesAvailable.map((eachLanguage) => (
                                <option key={eachLanguage} value={eachLanguage}>
                                    {eachLanguage}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="col-lg-2">
                        <select
                            className="form-select languageField"
                            name="codeKeybinding"
                            id="codeKeybinding"
                            value={codeKeybinding || "default"}
                            onChange={handleCodeKeybindingChange}
                        >
                            {codeKeybindingsAvailable.map((eachKeybinding) => (
                                <option key={eachKeybinding} value={eachKeybinding}>
                                    {eachKeybinding}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="col-lg-2">
                        <button className="btn btn-lg btn-outline-success" onClick={runCode}>
                            Run Code
                        </button>
                    </div>

                    <div className="col-lg-4">
                        <button
                            className="btn btn-lg btn-outline-primary"
                            onClick={() => {
                                roomId && copyToClipboard(roomId)
                            }}
                        >
                            Copy Room ID
                        </button>
                        <button className="btn btn-lg btn-outline-primary" onClick={handleExport}>
                            <BiExport />
                        </button>
                        <button className="btn btn-lg btn-outline-danger ms-2" onClick={handleLeave}>
                            Leave
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ height: "100vh", minWidth: "1000px" }}>
                <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
                    <div style={{ display: "flex", width: "100%", flexGrow: 1 }}>
                        <div
                            style={{
                                position: "relative",
                                display: "flex",
                                height: "100%",
                                width: "100%",
                                boxSizing: "border-box",
                            }}
                        >
                            <Layout model={model} factory={factory} />
                        </div>
                    </div>

                    <Toaster />
                </div>
            </div>
        </div>
    )
}
