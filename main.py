import asyncio
import sys
import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

async def main():
    print("=" * 60)
    print("MASTER ORCHESTRATOR - ARTILLEGENCE AI")
    print("=" * 60)
    print()
    print("  Agents:")
    print("    News Scanner           - every 5 min")
    print("    Market Analyzer        - every 30 min")
    print("    Opportunity Finder     - every 30 min")
    print("    Trending Tracker       - every 15 min")
    print("    Indian Market Tracker  - every 10 min")
    print("    Telegram Scanner       - every 5 min")
    print("    Visual Researcher      - every 20 min")
    print("    Google News Scanner    - every 10 min")
    print("    Google Trends Tracker  - every 20 min")
    print()
    print("  API Server: http://localhost:8000")
    print("  Dashboard:  http://localhost:3000")
    print("=" * 60)
    print()

    # Import agents
    from agents import start_all_agents

    # Create the FastAPI server config
    port = int(os.environ.get("PORT", 8000))
    config = uvicorn.Config("api:app", host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)

    # Run the API server and all agents concurrently
    try:
        await asyncio.gather(
            server.serve(),
            start_all_agents(),
        )
    except KeyboardInterrupt:
        print("\nShutting down system...")
    except Exception as e:
        print(f"\nSystem error: {e}")
    finally:
        print("System stopped.")

if __name__ == '__main__':
    asyncio.run(main())
