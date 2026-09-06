import json
import asyncio
from agent_tools import execute_tool, execute_python

def _sse(data: dict) -> str:
    """Encode a dict as an SSE data line, safely handling all Unicode."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

SYSTEM_PROMPT = """You are Artillegence AI, an elite market intelligence and coding assistant.
You have the ability to execute tools to access real-time information.

To use a tool, you must output a JSON block wrapped in <tool_call> tags:
<tool_call>
{"tool": "execute_python", "args": {"code": "print('hello')"}}
</tool_call>

Available Tools:
1. execute_python
   Args: {"code": "<python code>"}
   Description: Executes Python code in a stateful terminal. Use this to do math, calculate indicators (ADX, RSI), or scrape complex sites.
2. search_web
   Args: {"query": "<search query>"}
   Description: Search the web via DuckDuckGo.
3. get_stock_news
   Args: {"symbol": "<ticker>"}
   Description: Get the latest headlines for a stock.
4. get_technical_data
   Args: {"symbol": "<ticker>"}
   Description: Get real-time price, RSI, ADX, DI+, DI- for a stock.

RULES:
- When you use a tool, STOP writing. The system will execute the tool and provide the output in the next message.
- You can use multiple tools in sequence.
- Show your reasoning process to the user, they like to see how you think.
- Format your final answer beautifully using Markdown.
"""

async def agentic_chat_stream(user_message: str, history: list, provider):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history
    messages.append({"role": "user", "content": user_message})
    
    max_loops = 5
    for loop in range(max_loops):
        current_response = ""
        in_tool_call = False
        tool_json_str = ""
        
        async for chunk in provider.chat_stream(messages):
            if "error" in chunk:
                yield _sse({"error": chunk["error"]})
                return
                
            choices = chunk.get("choices", [])
            if not choices:
                continue
                
            delta = choices[0].get("delta", {})
            content = delta.get("content", "") or ""
            reasoning = delta.get("reasoning_details", "")
            
            if reasoning:
                yield _sse({"reasoning": str(reasoning)})
                
            if content:
                current_response += content
                
                # Check for tool call tags
                if "<tool_call>" in current_response and not in_tool_call:
                    in_tool_call = True
                    tool_json_str = current_response.split("<tool_call>")[-1]
                    # Stream everything before the tool call
                    pre_text = current_response.split("<tool_call>")[0]
                    if pre_text:
                        yield _sse({"content": pre_text})
                elif in_tool_call:
                    tool_json_str += content
                    if "</tool_call>" in tool_json_str:
                        # Tool call complete!
                        tool_json_str = tool_json_str.split("</tool_call>")[0].strip()
                        break # break the async for loop to execute tool
                else:
                    yield _sse({"content": content})
        
        messages.append({"role": "assistant", "content": current_response})
        
        if in_tool_call and "</tool_call>" in current_response:
            # Parse and execute
            try:
                tool_call = json.loads(tool_json_str)
                tool_name = tool_call.get("tool")
                yield _sse({"status": f"Executing {tool_name}..."})
                tool_output = await execute_tool(tool_call)
                yield _sse({"status": "Tool finished."})
                
                messages.append({
                    "role": "user", 
                    "content": f"Tool output for {tool_call.get('tool')}:\n```\n{tool_output}\n```\nContinue."
                })
            except Exception as e:
                messages.append({
                    "role": "user",
                    "content": f"Failed to parse or execute tool call. Error: {e}\nFix the JSON and try again."
                })
        else:
            # Done!
            break
