import os
import sys

# Add parent dir to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.planning_agent import PlanningAgent
from app.agents.generator_agent import GeneratorAgent
from app.agents.execution_agent import ExecutionAgent
from app.agents.bug_analysis_agent import BugAnalysisAgent
from app.agents.report_agent import ReportAgent

def test_pipeline():
    url = "https://example.com"
    print(f"--- STARTING AGENT PIPELINE TEST ON: {url} ---")
    
    # 1. Planning Agent
    print("\n[1] Running Planning Agent...")
    planner = PlanningAgent()
    plan = planner.analyze(url)
    print(f"Plan created successfully. Classification: {plan['site_type']}")
    print(f"Elements found: {plan['elements_found']}")
    
    # 2. Generator Agent
    print("\n[2] Running Test Case Generator Agent...")
    generator = GeneratorAgent()
    test_cases = generator.generate(plan, "Chrome")
    print(f"Generated {len(test_cases)} test cases:")
    for tc in test_cases:
        print(f"  - {tc['id']}: {tc['name']} ({tc['category']})")
        
    # 3. Execution Agent
    print("\n[3] Running Execution Agent (Requests + Pillow fallback)...")
    # Store screenshots in a temp folder
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "screenshots")
    executor = ExecutionAgent(output_dir=output_dir)
    results = executor.execute(test_cases, url, "Chrome")
    print(f"Executed {len(results)} test cases:")
    for r in results:
        print(f"  - {r['id']}: {r['status']} | Duration: {r['duration_seconds']}s")
        if r['error_message']:
            print(f"    Error: {r['error_message']}")
            
    # 4. Bug Analysis Agent
    print("\n[4] Running Bug Analysis Agent...")
    failed_runs = [r for r in results if r["status"] == "FAILED"]
    analyzer = BugAnalysisAgent()
    bugs = analyzer.analyze(failed_runs, url)
    print(f"Discovered {len(bugs)} bugs:")
    for b in bugs:
        print(f"  - {b['id']}: {b['name']} ({b['severity']})")
        print(f"    Root Cause: {b['possible_root_cause']}")
        
    # 5. Report Agent
    print("\n[5] Running Report Agent...")
    report_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "reports")
    reporter = ReportAgent(output_dir=report_dir)
    pdf_name = reporter.generate_pdf("manual_test_task", url, results, bugs, "Chrome")
    print(f"Report generated successfully: {pdf_name}")
    
    print("\n--- ALL AGENTS EXECUTED SUCCESSFULLY WITHOUT EXCEPTIONS ---")

if __name__ == "__main__":
    test_pipeline()
