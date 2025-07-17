<<<<<<< Updated upstream
# app/visualizations/nadia_analysis.py
import logging
from datetime import datetime
import json
from collections import Counter, defaultdict
from flask import current_app
import os

logger = logging.getLogger(__name__)

NAME = "nadia_analysis"
TITLE = "Analysis of Nadia Conti"
DESCRIPTION = "Visual analysis of Nadia Conti's activities to evaluate suspicions of illegal activities"

def get_data():
    logger.debug("Generating Nadia Conti analysis data")
    
    try:
        # Find any available communication data file
        comm_file = None
        
        # Try different configuration keys
        possible_keys = ["COMMUNICATION_FILE", "DATA_FILE"]
        for key in possible_keys:
            if current_app.config.get(key):
                comm_file = current_app.config[key]
                logger.info(f"Using {key}: {comm_file}")
                break
        
        if not comm_file:
            # Try to find files directly
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            data_dir = os.path.join(base_dir, "data")
            
            if os.path.exists(data_dir):
                for file in os.listdir(data_dir):
                    if file.endswith('.json'):
                        comm_file = os.path.join(data_dir, file)
                        logger.info(f"Using fallback file: {comm_file}")
                        break
        
        if not comm_file or not os.path.exists(comm_file):
            logger.error("No communication file found")
            return {"error": "No communication data file found"}
        
        logger.info(f"Loading communication data from: {comm_file}")
        with open(comm_file, "r") as f:
            comm_data = json.load(f)
        
        # Analyze the structure of the data to find communications
        nadia_communications = find_nadia_communications(comm_data)
        
        if not nadia_communications:
            logger.warning("No communications found for Nadia Conti")
            # Return a sample analysis to test the frontend
            sample_data = create_sample_analysis()
            # Include the full graph data for the frontend
            sample_data["graph_data"] = comm_data
            return sample_data
        
        logger.info(f"Found {len(nadia_communications)} communications for Nadia Conti")
        
        # Perform the analysis and include the full graph data
        analysis_result = analyze_nadia_data(nadia_communications)
        analysis_result["graph_data"] = comm_data
        return analysis_result
        
    except FileNotFoundError as e:
        logger.error(f"File not found in nadia_analysis: {str(e)}")
        return {"error": f"Data file not found: {str(e)}"}
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in nadia_analysis: {str(e)}")
        return {"error": f"Invalid JSON in data file: {str(e)}"}
    except Exception as e:
        logger.error(f"Unexpected error in nadia_analysis: {str(e)}", exc_info=True)
        return {"error": f"Analysis error: {str(e)}"}

def find_nadia_communications(comm_data):
    """Find Nadia Conti communications in various data formats"""
    
    nadia_communications = []
    nadia_id = "Nadia Conti"
    
    # Try different data structures
    
    # Method 1: Look for 'links' or 'edges' array
    links = comm_data.get("links", comm_data.get("edges", []))
    
    if links:
        logger.info(f"Found {len(links)} links in data")
        for link in links:
            if link.get("source") == nadia_id or link.get("target") == nadia_id:
                nadia_communications.append(process_communication_link(link, nadia_id))
    
    # Method 2: Look for 'nodes' with communication events
    if not nadia_communications:
        nodes = comm_data.get("nodes", [])
        logger.info(f"Found {len(nodes)} nodes in data, looking for communication events...")
        
        # This would require edge relationships - skip for now
    
    # Method 3: Look for direct message arrays
    if not nadia_communications:
        messages = comm_data.get("messages", comm_data.get("communications", []))
        if messages:
            logger.info(f"Found {len(messages)} messages in data")
            for msg in messages:
                if (msg.get("from") == nadia_id or msg.get("to") == nadia_id or 
                    msg.get("source") == nadia_id or msg.get("target") == nadia_id):
                    nadia_communications.append(process_communication_message(msg, nadia_id))
    
    return [comm for comm in nadia_communications if comm]  # Filter out None values

def process_communication_link(link, nadia_id):
    """Process a communication link into standard format"""
    try:
        datetime_str = link.get("datetime", link.get("timestamp", "2040-01-01T00:00:00"))
        
        # Handle different datetime formats
        comm_datetime = parse_datetime(datetime_str)
        
        return {
            "id": link.get("event_id", link.get("id", f"comm_{id(link)}")),
            "datetime": datetime_str,
            "date": comm_datetime.strftime("%Y-%m-%d"),
            "time": comm_datetime.strftime("%H:%M:%S"),
            "hour": comm_datetime.hour,
            "source": link.get("source", ""),
            "target": link.get("target", ""),
            "content": link.get("content", link.get("message", link.get("text", ""))),
            "is_sender": link.get("source") == nadia_id
        }
    except Exception as e:
        logger.warning(f"Error processing link: {e}")
        return None

def process_communication_message(msg, nadia_id):
    """Process a message into standard format"""
    try:
        datetime_str = msg.get("datetime", msg.get("timestamp", msg.get("date", "2040-01-01T00:00:00")))
        comm_datetime = parse_datetime(datetime_str)
        
        source = msg.get("from", msg.get("source", ""))
        target = msg.get("to", msg.get("target", ""))
        
        return {
            "id": msg.get("id", f"msg_{id(msg)}"),
            "datetime": datetime_str,
            "date": comm_datetime.strftime("%Y-%m-%d"),
            "time": comm_datetime.strftime("%H:%M:%S"),
            "hour": comm_datetime.hour,
            "source": source,
            "target": target,
            "content": msg.get("content", msg.get("message", msg.get("text", ""))),
            "is_sender": source == nadia_id
        }
    except Exception as e:
        logger.warning(f"Error processing message: {e}")
        return None

def parse_datetime(datetime_str):
    """Parse datetime string in various formats"""
    try:
        # Try ISO format first
        if "T" in datetime_str:
            clean_datetime = datetime_str.replace("Z", "")
            if "+" in clean_datetime:
                clean_datetime = clean_datetime.split("+")[0]
            return datetime.fromisoformat(clean_datetime)
        elif " " in datetime_str:
            return datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
        else:
            return datetime.strptime(datetime_str, "%Y-%m-%d")
    except:
        # Fallback to a default date
        return datetime(2040, 1, 1, 0, 0, 0)

def analyze_nadia_data(nadia_communications):
    """Analyze Nadia's communication data"""
    
    # Sort by datetime
    nadia_communications.sort(key=lambda x: x["datetime"])
    
    # Analyze contacts
    contacts = Counter()
    for comm in nadia_communications:
        other_party = comm["target"] if comm["is_sender"] else comm["source"]
        if other_party and other_party != "Nadia Conti":
            contacts[other_party] += 1
    
    # Analyze timing patterns
    time_patterns = {
        "early_morning": 0,    # 5-7 AM
        "business_hours": 0,   # 8-17 PM  
        "evening": 0,          # 18-22 PM
        "late_night": 0        # 23-4 AM
    }
    
    hourly_distribution = [0] * 24
    
    for comm in nadia_communications:
        hour = comm["hour"]
        hourly_distribution[hour] += 1
        
        if 5 <= hour <= 7:
            time_patterns["early_morning"] += 1
        elif 8 <= hour <= 17:
            time_patterns["business_hours"] += 1
        elif 18 <= hour <= 22:
            time_patterns["evening"] += 1
        else:  # 23-24 or 0-4
            time_patterns["late_night"] += 1
    
    # Analyze suspicious keywords
    suspicious_keywords = [
        "permit", "authorization", "clearance", "secret", "private", "special",
        "arrangement", "deal", "payment", "money", "cash", "funding",
        "restricted", "access", "corridor", "bypass", "loophole",
        "mining", "extraction", "drilling", "equipment", "operation",
        "illegal", "unauthorized", "bribe", "corruption", "under table",
        "approve", "approval", "license", "certificate", "official"
    ]
    
    keyword_mentions = Counter()
    suspicious_messages = []
    
    for comm in nadia_communications:
        content_lower = comm["content"].lower()
        found_keywords = []
        
        for keyword in suspicious_keywords:
            if keyword in content_lower:
                keyword_mentions[keyword] += 1
                found_keywords.append(keyword)
        
        if found_keywords:
            suspicious_messages.append({
                **comm,
                "keywords": found_keywords,
                "suspicion_score": len(found_keywords)
            })
    
    # Sort suspicious messages by suspicion score
    suspicious_messages.sort(key=lambda x: x["suspicion_score"], reverse=True)
    
    # Find permit-related communications
    permit_related = []
    for comm in nadia_communications:
        content_lower = comm["content"].lower()
        if any(term in content_lower for term in ["permit", "authorization", "approval", "clearance", "license"]):
            permit_related.append(comm)
    
    # Create network data
    network_nodes = [{
        "id": "Nadia Conti",
        "name": "Nadia Conti",
        "type": "Person",
        "category": "central",
        "communication_count": len(nadia_communications)
    }]
    
    network_links = []
    
    # Add top contacts as nodes
    for contact, count in contacts.most_common(15):
        if contact:
            network_nodes.append({
                "id": contact,
                "name": contact,
                "type": "Person",
                "category": "contact",
                "communication_count": count
            })
            
            network_links.append({
                "source": "Nadia Conti",
                "target": contact,
                "weight": count,
                "type": "communication"
            })
    
    # Create timeline events
    timeline_events = []
    for i, comm in enumerate(nadia_communications):
        event_type = "normal"
        
        # Determine event type based on content
        content_lower = comm["content"].lower()
        if any(keyword in content_lower for keyword in ["secret", "private", "illegal", "bribe", "unauthorized", "corruption"]):
            event_type = "suspicious"
        elif any(term in content_lower for term in ["permit", "authorization", "approval", "clearance", "license"]):
            event_type = "permit_related"
        
        timeline_events.append({
            "id": comm["id"],
            "datetime": comm["datetime"],
            "date": comm["date"],
            "time": comm["time"],
            "other_party": comm["target"] if comm["is_sender"] else comm["source"],
            "content_preview": comm["content"][:100] + "..." if len(comm["content"]) > 100 else comm["content"],
            "content": comm["content"],
            "is_sender": comm["is_sender"],
            "event_type": event_type,
            "order": i
        })
    
    # Generate suspicion analysis
    suspicion_indicators = []
    
    # Check for unusual timing patterns
    total_comms = len(nadia_communications)
    late_night_percent = time_patterns["late_night"] / total_comms if total_comms > 0 else 0
    
    if late_night_percent > 0.15:  # More than 15%
        suspicion_indicators.append({
            "type": "timing",
            "description": f"Unusually high number of late-night communications ({time_patterns['late_night']} out of {total_comms} total, {late_night_percent:.1%})",
            "severity": "medium"
        })
    
    # Check for suspicious keywords
    if len(keyword_mentions) > 0:
        total_keyword_count = sum(keyword_mentions.values())
        top_keywords = list(keyword_mentions.keys())[:5]
        suspicion_indicators.append({
            "type": "content",
            "description": f"Multiple suspicious keywords detected ({total_keyword_count} mentions): {', '.join(top_keywords)}",
            "severity": "high" if len(keyword_mentions) > 5 else "medium"
        })
    
    # Check for permit-related activity
    if len(permit_related) > 3:
        suspicion_indicators.append({
            "type": "authority_abuse", 
            "description": f"Frequent involvement in permit-related communications ({len(permit_related)} instances)",
            "severity": "high"
        })
    
    # Check for concentrated communication patterns
    high_contact_entities = [contact for contact, count in contacts.items() if count > 5]
    if len(high_contact_entities) > 2:
        suspicion_indicators.append({
            "type": "network",
            "description": f"Frequent communication with specific entities: {', '.join(high_contact_entities[:3])}",
            "severity": "medium"
        })
    
    # Check for suspicious message content
    if len(suspicious_messages) > 5:
        suspicion_indicators.append({
            "type": "content_analysis",
            "description": f"High number of messages containing suspicious keywords ({len(suspicious_messages)} messages)",
            "severity": "high"
        })
    
    # Determine overall recommendation
    high_severity_count = sum(1 for indicator in suspicion_indicators if indicator["severity"] == "high")
    medium_severity_count = sum(1 for indicator in suspicion_indicators if indicator["severity"] == "medium")
    
    if high_severity_count >= 2:
        recommendation = "INVESTIGATE FURTHER"
    elif high_severity_count >= 1 or medium_severity_count >= 3:
        recommendation = "MONITOR"
    else:
        recommendation = "LOW RISK"
    
    # Prepare response data
    response_data = {
        "nadia_profile": {
            "total_communications": len(nadia_communications),
            "date_range": {
                "start": nadia_communications[0]["date"] if nadia_communications else None,
                "end": nadia_communications[-1]["date"] if nadia_communications else None
            },
            "top_contacts": dict(contacts.most_common(10))
        },
        "communication_patterns": {
            "time_distribution": time_patterns,
            "hourly_distribution": hourly_distribution,
            "suspicious_messages_count": len(suspicious_messages)
        },
        "keyword_analysis": {
            "keyword_mentions": dict(keyword_mentions.most_common(15)),
            "suspicious_messages": suspicious_messages[:20]  # Top 20 most suspicious
        },
        "authority_patterns": {
            "permit_related": permit_related,
            "authority_abuse_indicators": []
        },
        "network_data": {
            "nodes": network_nodes,
            "links": network_links
        },
        "timeline": timeline_events,
        "suspicion_analysis": {
            "indicators": suspicion_indicators,
            "overall_score": len(suspicion_indicators),
            "recommendation": recommendation
        }
    }
    
    logger.info(f"Generated analysis with {len(suspicion_indicators)} indicators, recommendation: {recommendation}")
    logger.info(f"Analysis summary: {len(nadia_communications)} communications, {len(contacts)} contacts, {len(keyword_mentions)} suspicious keywords")
    
    return response_data

def create_sample_analysis():
    """Create sample analysis data for testing when no real data is found"""
    
    logger.info("Creating sample analysis data for testing")
    
    # Create sample communications
    sample_communications = [
        {
            "id": "sample_1",
            "datetime": "2040-10-01T14:30:00",
            "date": "2040-10-01",
            "time": "14:30:00",
            "hour": 14,
            "source": "Nadia Conti",
            "target": "Sample Contact 1",
            "content": "We need to discuss the permit authorization process for the new mining operation.",
            "is_sender": True
        },
        {
            "id": "sample_2",
            "datetime": "2040-10-02T23:45:00",
            "date": "2040-10-02",
            "time": "23:45:00",
            "hour": 23,
            "source": "Sample Contact 2",
            "target": "Nadia Conti",
            "content": "The private arrangement we discussed needs to remain secret.",
            "is_sender": False
        },
        {
            "id": "sample_3",
            "datetime": "2040-10-03T09:15:00",
            "date": "2040-10-03",
            "time": "09:15:00",
            "hour": 9,
            "source": "Nadia Conti",
            "target": "Sample Contact 3",
            "content": "Can you approve the special access clearance for the restricted area?",
            "is_sender": True
        }
    ]
    
    # Analyze the sample data
    return analyze_nadia_data(sample_communications)
=======
# app/visualizations/nadia_analysis.py
import logging
from datetime import datetime
import json
from collections import Counter, defaultdict
from flask import current_app
import os
import base64
import io
from wordcloud import WordCloud
import re

logger = logging.getLogger(__name__)

NAME = "nadia_analysis"
TITLE = "Analysis of Nadia Conti"
DESCRIPTION = "Visual analysis of Nadia Conti's activities to evaluate suspicions of illegal activities"

def get_data():
    logger.debug("Generating Nadia Conti analysis data")
    
    try:
        # Find any available communication data file
        comm_file = None
        
        # Try different configuration keys
        possible_keys = ["COMMUNICATION_FILE", "DATA_FILE"]
        for key in possible_keys:
            if current_app.config.get(key):
                comm_file = current_app.config[key]
                logger.info(f"Using {key}: {comm_file}")
                break
        
        if not comm_file:
            # Try to find files directly
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            data_dir = os.path.join(base_dir, "data")
            
            if os.path.exists(data_dir):
                for file in os.listdir(data_dir):
                    if file.endswith('.json'):
                        comm_file = os.path.join(data_dir, file)
                        logger.info(f"Using fallback file: {comm_file}")
                        break
        
        if not comm_file or not os.path.exists(comm_file):
            logger.error("No communication file found")
            return {"error": "No communication data file found"}
        
        logger.info(f"Loading communication data from: {comm_file}")
        with open(comm_file, "r") as f:
            comm_data = json.load(f)
        
        # Analyze the structure of the data to find communications
        nadia_communications = find_nadia_communications(comm_data)
        
        if not nadia_communications:
            logger.warning("No communications found for Nadia Conti")
            # Return a sample analysis to test the frontend
            sample_data = create_sample_analysis()
            # Include the full graph data for the frontend
            sample_data["graph_data"] = comm_data
            
            # Generate sample wordcloud
            sample_data["wordcloud"] = {
                "all_communications": generate_wordcloud_image([]),
                "available_contacts": []
            }
            
            return sample_data
        
        logger.info(f"Found {len(nadia_communications)} communications for Nadia Conti")
        
        # Perform the analysis and include the full graph data
        analysis_result = analyze_nadia_data(nadia_communications)
        analysis_result["graph_data"] = comm_data
        
        # Generate default wordcloud for all communications
        analysis_result["wordcloud"] = {
            "all_communications": generate_wordcloud_image(nadia_communications),
            "available_contacts": list(set([
                comm["target"] if comm["is_sender"] else comm["source"] 
                for comm in nadia_communications
                if comm["target"] != "Nadia Conti" and comm["source"] != "Nadia Conti"
            ]))
        }
        
        return analysis_result
        
    except FileNotFoundError as e:
        logger.error(f"File not found in nadia_analysis: {str(e)}")
        return {"error": f"Data file not found: {str(e)}"}
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in nadia_analysis: {str(e)}")
        return {"error": f"Invalid JSON in data file: {str(e)}"}
    except Exception as e:
        logger.error(f"Unexpected error in nadia_analysis: {str(e)}", exc_info=True)
        return {"error": f"Analysis error: {str(e)}"}

def find_nadia_communications(comm_data):
    """Find Nadia Conti communications in various data formats"""
    
    nadia_communications = []
    nadia_id = "Nadia Conti"
    
    # Try different data structures
    
    # Method 1: Look for 'links' or 'edges' array
    links = comm_data.get("links", comm_data.get("edges", []))
    
    if links:
        logger.info(f"Found {len(links)} links in data")
        for link in links:
            if link.get("source") == nadia_id or link.get("target") == nadia_id:
                nadia_communications.append(process_communication_link(link, nadia_id))
    
    # Method 2: Look for 'nodes' with communication events
    if not nadia_communications:
        nodes = comm_data.get("nodes", [])
        logger.info(f"Found {len(nodes)} nodes in data, looking for communication events...")
        
        # This would require edge relationships - skip for now
    
    # Method 3: Look for direct message arrays
    if not nadia_communications:
        messages = comm_data.get("messages", comm_data.get("communications", []))
        if messages:
            logger.info(f"Found {len(messages)} messages in data")
            for msg in messages:
                if (msg.get("from") == nadia_id or msg.get("to") == nadia_id or 
                    msg.get("source") == nadia_id or msg.get("target") == nadia_id):
                    nadia_communications.append(process_communication_message(msg, nadia_id))
    
    return [comm for comm in nadia_communications if comm]  # Filter out None values

def process_communication_link(link, nadia_id):
    """Process a communication link into standard format"""
    try:
        datetime_str = link.get("datetime", link.get("timestamp", "2040-01-01T00:00:00"))
        
        # Handle different datetime formats
        comm_datetime = parse_datetime(datetime_str)
        
        return {
            "id": link.get("event_id", link.get("id", f"comm_{id(link)}")),
            "datetime": datetime_str,
            "date": comm_datetime.strftime("%Y-%m-%d"),
            "time": comm_datetime.strftime("%H:%M:%S"),
            "hour": comm_datetime.hour,
            "source": link.get("source", ""),
            "target": link.get("target", ""),
            "content": link.get("content", link.get("message", link.get("text", ""))),
            "is_sender": link.get("source") == nadia_id
        }
    except Exception as e:
        logger.warning(f"Error processing link: {e}")
        return None

def process_communication_message(msg, nadia_id):
    """Process a message into standard format"""
    try:
        datetime_str = msg.get("datetime", msg.get("timestamp", msg.get("date", "2040-01-01T00:00:00")))
        comm_datetime = parse_datetime(datetime_str)
        
        source = msg.get("from", msg.get("source", ""))
        target = msg.get("to", msg.get("target", ""))
        
        return {
            "id": msg.get("id", f"msg_{id(msg)}"),
            "datetime": datetime_str,
            "date": comm_datetime.strftime("%Y-%m-%d"),
            "time": comm_datetime.strftime("%H:%M:%S"),
            "hour": comm_datetime.hour,
            "source": source,
            "target": target,
            "content": msg.get("content", msg.get("message", msg.get("text", ""))),
            "is_sender": source == nadia_id
        }
    except Exception as e:
        logger.warning(f"Error processing message: {e}")
        return None

def parse_datetime(datetime_str):
    """Parse datetime string in various formats"""
    try:
        # Try ISO format first
        if "T" in datetime_str:
            clean_datetime = datetime_str.replace("Z", "")
            if "+" in clean_datetime:
                clean_datetime = clean_datetime.split("+")[0]
            return datetime.fromisoformat(clean_datetime)
        elif " " in datetime_str:
            return datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
        else:
            return datetime.strptime(datetime_str, "%Y-%m-%d")
    except:
        # Fallback to a default date
        return datetime(2040, 1, 1, 0, 0, 0)

def analyze_nadia_data(nadia_communications):
    """Analyze Nadia's communication data"""
    
    # Sort by datetime
    nadia_communications.sort(key=lambda x: x["datetime"])
    
    # Analyze contacts
    contacts = Counter()
    for comm in nadia_communications:
        other_party = comm["target"] if comm["is_sender"] else comm["source"]
        if other_party and other_party != "Nadia Conti":
            contacts[other_party] += 1
    
    # Analyze timing patterns
    time_patterns = {
        "early_morning": 0,    # 5-7 AM
        "business_hours": 0,   # 8-17 PM  
        "evening": 0,          # 18-22 PM
        "late_night": 0        # 23-4 AM
    }
    
    hourly_distribution = [0] * 24
    
    for comm in nadia_communications:
        hour = comm["hour"]
        hourly_distribution[hour] += 1
        
        if 5 <= hour <= 7:
            time_patterns["early_morning"] += 1
        elif 8 <= hour <= 17:
            time_patterns["business_hours"] += 1
        elif 18 <= hour <= 22:
            time_patterns["evening"] += 1
        else:  # 23-24 or 0-4
            time_patterns["late_night"] += 1
    
    # Analyze suspicious keywords
    suspicious_keywords = [
        "permit", "authorization", "clearance", "secret", "private", "special",
        "arrangement", "deal", "payment", "money", "cash", "funding",
        "restricted", "access", "corridor", "bypass", "loophole",
        "mining", "extraction", "drilling", "equipment", "operation",
        "illegal", "unauthorized", "bribe", "corruption", "under table",
        "approve", "approval", "license", "certificate", "official"
    ]
    
    keyword_mentions = Counter()
    suspicious_messages = []
    
    # Analyze corruption events
    corruption_mentions = Counter()
    corruption_messages = []
    
    for comm in nadia_communications:
        content_lower = comm["content"].lower()
        found_keywords = []
        found_corruption_events = []
        
        # Check for suspicious keywords
        for keyword in suspicious_keywords:
            if keyword in content_lower:
                keyword_mentions[keyword] += 1
                found_keywords.append(keyword)
        
        # Check for corruption events
        for corruption_type, keywords in corruption_events.items():
            for keyword in keywords:
                if keyword in content_lower:
                    corruption_mentions[corruption_type] += 1
                    if corruption_type not in found_corruption_events:
                        found_corruption_events.append(corruption_type)
        
        if found_keywords:
            suspicious_messages.append({
                **comm,
                "keywords": found_keywords,
                "suspicion_score": len(found_keywords)
            })
        
        if found_corruption_events:
            corruption_messages.append({
                **comm,
                "corruption_events": found_corruption_events,
                "corruption_score": len(found_corruption_events)
            })
    
    # Sort suspicious messages by suspicion score
    suspicious_messages.sort(key=lambda x: x["suspicion_score"], reverse=True)
    
    # Sort corruption messages by corruption score
    corruption_messages.sort(key=lambda x: x["corruption_score"], reverse=True)
    
    # Find permit-related communications
    permit_related = []
    for comm in nadia_communications:
        content_lower = comm["content"].lower()
        if any(term in content_lower for term in ["permit", "authorization", "approval", "clearance", "license"]):
            permit_related.append(comm)
    
    # Create network data
    network_nodes = [{
        "id": "Nadia Conti",
        "name": "Nadia Conti",
        "type": "Person",
        "category": "central",
        "communication_count": len(nadia_communications)
    }]
    
    network_links = []
    
    # Add top contacts as nodes
    for contact, count in contacts.most_common(15):
        if contact:
            network_nodes.append({
                "id": contact,
                "name": contact,
                "type": "Person",
                "category": "contact",
                "communication_count": count
            })
            
            network_links.append({
                "source": "Nadia Conti",
                "target": contact,
                "weight": count,
                "type": "communication"
            })
    
    # Create timeline events
    timeline_events = []
    for i, comm in enumerate(nadia_communications):
        event_type = "normal"
        corruption_events_found = []
        
        # Determine event type based on content
        content_lower = comm["content"].lower()
        
        # Check for corruption events
        for corruption_type, keywords in corruption_events.items():
            for keyword in keywords:
                if keyword in content_lower:
                    if corruption_type not in corruption_events_found:
                        corruption_events_found.append(corruption_type)
        
        # Set event type based on priority
        if corruption_events_found:
            event_type = "corruption_related"
        elif any(keyword in content_lower for keyword in ["secret", "private", "illegal", "bribe", "unauthorized", "corruption"]):
            event_type = "suspicious"
        elif any(term in content_lower for term in ["permit", "authorization", "approval", "clearance", "license"]):
            event_type = "permit_related"
        
        timeline_events.append({
            "id": comm["id"],
            "datetime": comm["datetime"],
            "date": comm["date"],
            "time": comm["time"],
            "other_party": comm["target"] if comm["is_sender"] else comm["source"],
            "content_preview": comm["content"][:100] + "..." if len(comm["content"]) > 100 else comm["content"],
            "content": comm["content"],
            "is_sender": comm["is_sender"],
            "event_type": event_type,
            "corruption_events": corruption_events_found,
            "order": i
        })
    
    # Generate suspicion analysis
    suspicion_indicators = []
    
    # Check for unusual timing patterns
    total_comms = len(nadia_communications)
    late_night_percent = time_patterns["late_night"] / total_comms if total_comms > 0 else 0
    
    if late_night_percent > 0.15:  # More than 15%
        suspicion_indicators.append({
            "type": "timing",
            "description": f"Unusually high number of late-night communications ({time_patterns['late_night']} out of {total_comms} total, {late_night_percent:.1%})",
            "severity": "medium"
        })
    
    # Check for suspicious keywords
    if len(keyword_mentions) > 0:
        total_keyword_count = sum(keyword_mentions.values())
        top_keywords = list(keyword_mentions.keys())[:5]
        suspicion_indicators.append({
            "type": "content",
            "description": f"Multiple suspicious keywords detected ({total_keyword_count} mentions): {', '.join(top_keywords)}",
            "severity": "high" if len(keyword_mentions) > 5 else "medium"
        })
    
    # Check for corruption events
    if len(corruption_mentions) > 0:
        total_corruption_count = sum(corruption_mentions.values())
        top_corruption_events = list(corruption_mentions.keys())[:5]
        suspicion_indicators.append({
            "type": "corruption_events",
            "description": f"Multiple corruption events detected ({total_corruption_count} instances): {', '.join(top_corruption_events)}",
            "severity": "high" if len(corruption_mentions) > 3 else "medium"
        })
    
    # Check for permit-related activity
    if len(permit_related) > 3:
        suspicion_indicators.append({
            "type": "authority_abuse", 
            "description": f"Frequent involvement in permit-related communications ({len(permit_related)} instances)",
            "severity": "high"
        })
    
    # Check for concentrated communication patterns
    high_contact_entities = [contact for contact, count in contacts.items() if count > 5]
    if len(high_contact_entities) > 2:
        suspicion_indicators.append({
            "type": "network",
            "description": f"Frequent communication with specific entities: {', '.join(high_contact_entities[:3])}",
            "severity": "medium"
        })
    
    # Check for suspicious message content
    if len(suspicious_messages) > 5:
        suspicion_indicators.append({
            "type": "content_analysis",
            "description": f"High number of messages containing suspicious keywords ({len(suspicious_messages)} messages)",
            "severity": "high"
        })
    
    # Check for corruption-related messages
    if len(corruption_messages) > 3:
        suspicion_indicators.append({
            "type": "corruption_analysis",
            "description": f"High number of messages containing corruption indicators ({len(corruption_messages)} messages)",
            "severity": "high"
        })
    
    # Determine overall recommendation
    high_severity_count = sum(1 for indicator in suspicion_indicators if indicator["severity"] == "high")
    medium_severity_count = sum(1 for indicator in suspicion_indicators if indicator["severity"] == "medium")
    
    if high_severity_count >= 2:
        recommendation = "INVESTIGATE FURTHER"
    elif high_severity_count >= 1 or medium_severity_count >= 3:
        recommendation = "MONITOR"
    else:
        recommendation = "LOW RISK"
    
    # Prepare response data
    response_data = {
        "nadia_profile": {
            "total_communications": len(nadia_communications),
            "date_range": {
                "start": nadia_communications[0]["date"] if nadia_communications else None,
                "end": nadia_communications[-1]["date"] if nadia_communications else None
            },
            "top_contacts": dict(contacts.most_common(10))
        },
        "communication_patterns": {
            "time_distribution": time_patterns,
            "hourly_distribution": hourly_distribution,
            "suspicious_messages_count": len(suspicious_messages),
            "corruption_messages_count": len(corruption_messages)
        },
        "keyword_analysis": {
            "keyword_mentions": dict(keyword_mentions.most_common(15)),
            "suspicious_messages": suspicious_messages[:20]  # Top 20 most suspicious
        },
        "corruption_analysis": {
            "corruption_mentions": dict(corruption_mentions.most_common(10)),
            "corruption_messages": corruption_messages[:20]  # Top 20 most corruption-related
        },
        "authority_patterns": {
            "permit_related": permit_related,
            "authority_abuse_indicators": []
        },
        "network_data": {
            "nodes": network_nodes,
            "links": network_links
        },
        "timeline": timeline_events,
        "suspicion_analysis": {
            "indicators": suspicion_indicators,
            "overall_score": len(suspicion_indicators),
            "recommendation": recommendation
        }
    }
    
    logger.info(f"Generated analysis with {len(suspicion_indicators)} indicators, recommendation: {recommendation}")
    logger.info(f"Analysis summary: {len(nadia_communications)} communications, {len(contacts)} contacts, {len(keyword_mentions)} suspicious keywords, {len(corruption_mentions)} corruption events")
    
    return response_data

def create_sample_analysis():
    """Create sample analysis data for testing when no real data is found"""
    
    logger.info("Creating sample analysis data for testing")
    
    # Create sample communications
    sample_communications = [
        {
            "id": "sample_1",
            "datetime": "2040-10-01T14:30:00",
            "date": "2040-10-01",
            "time": "14:30:00",
            "hour": 14,
            "source": "Nadia Conti",
            "target": "Sample Contact 1",
            "content": "We need to discuss the permit authorization process for the new mining operation.",
            "is_sender": True
        },
        {
            "id": "sample_2",
            "datetime": "2040-10-02T23:45:00",
            "date": "2040-10-02",
            "time": "23:45:00",
            "hour": 23,
            "source": "Sample Contact 2",
            "target": "Nadia Conti",
            "content": "The private arrangement we discussed needs to remain secret.",
            "is_sender": False
        },
        {
            "id": "sample_3",
            "datetime": "2040-10-03T09:15:00",
            "date": "2040-10-03",
            "time": "09:15:00",
            "hour": 9,
            "source": "Nadia Conti",
            "target": "Sample Contact 3",
            "content": "Can you approve the special access clearance for the restricted area?",
            "is_sender": True
        }
    ]
    
    # Analyze the sample data
    return analyze_nadia_data(sample_communications)

corruption_events = {
    "document destruction and forgery": [
        "destroy", "destruction", "documentation", "documented",
        "revised", "modified", "changed"
    ],

    "permission management": [
        "permit", "approval", "approved", "authorization",
        "cancel", "canceled", "cancellation"
    ],

    "illicit payments and bribery": [
        "payment", "fee", "funding", "cost",
        "favor",          
        "protocol", "arrangement"  
    ],

    "special access": [
        "acces", "special", "secured",
        "corridor", "entrance"
    ],

    "use of intermediaries": [
        "middleman"
    ],

    "confidentiality abuse": [
        "confidentiality", "encrypted"
    ],

    "suspicious activity": [
        "unusual", "suspiciou", "suspect", "questioning"
    ],

    "unauthorized access": [
        "unauthorized"
    ],

    "favoritism": [
        "favor"
    ],

    "money laundering": [
        "funding"
    ]
}


def generate_wordcloud_image(communications, filter_person=None, width=800, height=400, include_indirect=False):
    """Generate a word cloud image from communications"""
    try:
        # Filter communications if a specific person is requested
        if filter_person:
            # If we already have filtered communications from POST, use them directly
            filtered_communications = communications
        else:
            # For general wordcloud, include all Nadia communications
            filtered_communications = [
                comm for comm in communications
                if (comm.get("source") == "Nadia Conti" or comm.get("target") == "Nadia Conti")
            ]
        
        # Extract text from communications
        text = " ".join([comm.get("content", "") for comm in filtered_communications])
        
        logger.info(f"Wordcloud generation: {len(filtered_communications)} communications, text length: {len(text)}")
        if filter_person:
            logger.info(f"Sample text for {filter_person}: {text[:200]}...")
        
        # Clean and preprocess text
        text = preprocess_text_for_wordcloud(text)
        
        if not text.strip():
            # Return empty image if no text
            return generate_empty_wordcloud(width, height)
        
        # Create deterministic seed based on content
        import hashlib
        content_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        seed = int(content_hash[:8], 16) % (2**32)  # Use first 8 chars as seed
        
        # Configure WordCloud with fixed seed for deterministic layout
        wordcloud = WordCloud(
            width=width,
            height=height,
            background_color='white',
            colormap='YlGn',
            max_words=150,
            relative_scaling=0.5,
            min_font_size=10,
            max_font_size=80,
            prefer_horizontal=0.6,  # 70% horizontal, 30% vertical
            margin=2, 
            stopwords=get_stopwords(),
            collocations=False,
            repeat=False,
            random_state=seed  # This makes it deterministic!
        ).generate(text)
        
        # Convert to base64 image
        img_buffer = io.BytesIO()
        wordcloud.to_image().save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
        
        return {
            "image": f"data:image/png;base64,{img_base64}",
            "word_count": len(text.split()),
            "filtered_communications": len(filtered_communications)
        }
        
    except Exception as e:
        logger.error(f"Error generating wordcloud: {str(e)}")
        return generate_empty_wordcloud(width, height)

def preprocess_text_for_wordcloud(text):
    """Clean and preprocess text for word cloud generation"""
    # Remove HTML tags if any
    text = re.sub(r'<[^>]+>', '', text)
    
    # Remove URLs
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    
    # Remove email addresses
    text = re.sub(r'\S+@\S+', '', text)
    
    # Remove numbers and special characters but keep letters and spaces
    text = re.sub(r'[^a-zA-Z\s]', ' ', text)
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def get_stopwords():
    """Get comprehensive stopwords for word cloud"""
    stopwords = set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'would', 'should',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
        'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'his', 'hers', 'ours', 'theirs',
        'this', 'that', 'these', 'those', 'here', 'there', 'where', 'when', 'why', 'how', 'what',
        'which', 'who', 'whom', 'whose', 'if', 'then', 'else', 'than', 'as', 'so', 'too', 'very',
        'just', 'now', 'only', 'also', 'even', 'still', 'again', 'back', 'more', 'most', 'much',
        'many', 'some', 'any', 'all', 'each', 'every', 'both', 'either', 'neither', 'one', 'two',
        'first', 'second', 'last', 'next', 'previous', 'same', 'other', 'another', 'such', 'like',
        'said', 'say', 'says', 'get', 'got', 'give', 'given', 'go', 'going', 'gone', 'come', 'came',
        'take', 'taken', 'make', 'made', 'know', 'knew', 'think', 'thought', 'see', 'saw', 'look',
        'looking', 'tell', 'told', 'ask', 'asked', 'work', 'worked', 'call', 'called', 'try', 'tried',
        'use', 'used', 'want', 'wanted', 'need', 'needed', 'feel', 'felt', 'become', 'became',
        'leave', 'left', 'put', 'find', 'found', 'seem', 'seemed', 'turn', 'turned', 'start', 'started',
        'show', 'showed', 'hear', 'heard', 'play', 'played', 'run', 'ran', 'move', 'moved', 'live', 'lived',
        'believe', 'believed', 'hold', 'held', 'bring', 'brought', 'happen', 'happened', 'write', 'wrote',
        'sit', 'sat', 'stand', 'stood', 'lose', 'lost', 'pay', 'paid', 'meet', 'met', 'include', 'included',
        'continue', 'continued', 'set', 'lot', 'right', 'new', 'old', 'good', 'bad', 'small', 'large',
        'great', 'little', 'own', 'long', 'high', 'different', 'following', 'important', 'public',
        'able', 'available', 'sure', 'possible', 'likely', 'social', 'local', 'certain', 'real',
        'best', 'better', 'early', 'late', 'young', 'old', 'hard', 'easy', 'strong', 'clear',
        'nadia', 'conti'  # Remove the name being analyzed
    ])
    
    return stopwords

def generate_empty_wordcloud(width=800, height=400):
    """Generate an empty word cloud image"""
    try:
        # Create a simple empty image
        from PIL import Image, ImageDraw
        
        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)
        
        # Add "No words to display" message
        message = "No words to display"
        bbox = draw.textbbox((0, 0), message)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (width - text_width) // 2
        y = (height - text_height) // 2
        
        draw.text((x, y), message, fill='gray')
        
        # Convert to base64
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
        
        return {
            "image": f"data:image/png;base64,{img_base64}",
            "word_count": 0,
            "filtered_communications": 0
        }
        
    except Exception as e:
        logger.error(f"Error generating empty wordcloud: {str(e)}")
        return {
            "image": "",
            "word_count": 0,
            "filtered_communications": 0
        }
>>>>>>> Stashed changes
