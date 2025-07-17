#!/usr/bin/env python3
"""
Script to create a DataFrame with direct and indirect messages for Nadia Conti analysis.
Columns: Date & Time, Type, Text, Sources, Targets, Event_Communication, Event_Monitoring
"""

import json
import csv
from datetime import datetime
from collections import defaultdict

def load_communication_data(file_path):
    """Load communication data from JSON file"""
    with open(file_path, 'r') as f:
        return json.load(f)

def find_intermediary_patterns(all_links, target_person="Nadia Conti"):
    """
    Find indirect communication patterns where messages might be relayed 
    through intermediaries to/from the target person.
    """
    indirect_patterns = []
    
    # Group messages by time windows (within 30 minutes)
    time_windows = defaultdict(list)
    
    for link in all_links:
        try:
            dt = datetime.strptime(link['datetime'], '%Y-%m-%d %H:%M:%S')
            # Create 30-minute time windows
            window_key = dt.replace(minute=dt.minute//30*30, second=0, microsecond=0)
            time_windows[window_key].append(link)
        except:
            continue
    
    # Look for potential relay patterns in each time window
    for window_time, messages in time_windows.items():
        if len(messages) < 2:
            continue
            
        # Find messages involving target person
        target_messages = [msg for msg in messages 
                          if msg['source'] == target_person or msg['target'] == target_person]
        
        # Find messages not involving target person directly
        other_messages = [msg for msg in messages 
                         if msg['source'] != target_person and msg['target'] != target_person]
        
        # Look for potential intermediaries (people who talk to both target and others)
        for target_msg in target_messages:
            intermediary = target_msg['source'] if target_msg['target'] == target_person else target_msg['target']
            
            # Find other messages involving this intermediary
            relay_messages = [msg for msg in other_messages 
                            if msg['source'] == intermediary or msg['target'] == intermediary]
            
            for relay_msg in relay_messages:
                indirect_patterns.append({
                    'target_message': target_msg,
                    'relay_message': relay_msg,
                    'intermediary': intermediary,
                    'window_time': window_time
                })
    
    return indirect_patterns

def create_messages_data(data, target_person="Nadia Conti"):
    """
    Create a comprehensive list of dictionaries with direct and indirect messages
    """
    messages_list = []
    
    # Process all links to find direct and indirect communications
    all_links = data['links']
    
    # Find direct communications
    direct_communications = []
    for link in all_links:
        if link['source'] == target_person or link['target'] == target_person:
            direct_communications.append(link)
    
    # Find indirect communication patterns
    indirect_patterns = find_intermediary_patterns(all_links, target_person)
    
    # Process direct communications
    for comm in direct_communications:
        try:
            dt = datetime.strptime(comm['datetime'], '%Y-%m-%d %H:%M:%S')
            
            # Determine direction
            if comm['source'] == target_person:
                msg_type = "Direct Outgoing"
                sources = target_person
                targets = comm['target']
            else:
                msg_type = "Direct Incoming"
                sources = comm['source']
                targets = target_person
            
            messages_list.append({
                'Date & Time': dt.strftime('%Y-%m-%d %H:%M:%S'),
                'Type': msg_type,
                'Communication_Category': 'Direct',
                'Text': comm['content'],
                'Sources': sources,
                'Targets': targets,
                'Event_Communication': comm['event_id'],
                'Event_Monitoring': 'Direct_Communication'
            })
        except Exception as e:
            print(f"Error processing direct communication: {e}")
            continue
    
    # Process indirect communications
    for pattern in indirect_patterns:
        try:
            target_msg = pattern['target_message']
            relay_msg = pattern['relay_message']
            intermediary = pattern['intermediary']
            
            # Target message
            dt = datetime.strptime(target_msg['datetime'], '%Y-%m-%d %H:%M:%S')
            
            if target_msg['source'] == target_person:
                msg_type = "Indirect via " + intermediary + " (Outgoing)"
                sources = target_person
                targets = f"{target_msg['target']} -> {intermediary}"
            else:
                msg_type = "Indirect via " + intermediary + " (Incoming)"
                sources = f"{target_msg['source']} -> {intermediary}"
                targets = target_person
            
            messages_list.append({
                'Date & Time': dt.strftime('%Y-%m-%d %H:%M:%S'),
                'Type': msg_type,
                'Communication_Category': 'Indirect',
                'Text': target_msg['content'],
                'Sources': sources,
                'Targets': targets,
                'Event_Communication': target_msg['event_id'],
                'Event_Monitoring': f"Indirect_Pattern_{pattern['window_time'].strftime('%Y%m%d_%H%M')}"
            })
            
            # Relay message
            dt_relay = datetime.strptime(relay_msg['datetime'], '%Y-%m-%d %H:%M:%S')
            
            messages_list.append({
                'Date & Time': dt_relay.strftime('%Y-%m-%d %H:%M:%S'),
                'Type': f"Relay Message (via {intermediary})",
                'Communication_Category': 'Indirect',
                'Text': relay_msg['content'],
                'Sources': relay_msg['source'],
                'Targets': relay_msg['target'],
                'Event_Communication': relay_msg['event_id'],
                'Event_Monitoring': f"Relay_Pattern_{pattern['window_time'].strftime('%Y%m%d_%H%M')}"
            })
            
        except Exception as e:
            print(f"Error processing indirect communication: {e}")
            continue
    
    # Sort by datetime
    messages_list.sort(key=lambda x: datetime.strptime(x['Date & Time'], '%Y-%m-%d %H:%M:%S'))
    
    return messages_list

def main():
    """Main function to generate the messages data"""
    
    # Load data
    print("Loading communication data...")
    data = load_communication_data('../data/MC3_graph_communication.json')
    
    print(f"Loaded {len(data['nodes'])} nodes and {len(data['links'])} links")
    
    # Create data list
    print("Processing messages for Nadia Conti...")
    messages_data = create_messages_data(data, "Nadia Conti")
    
    print(f"Generated data with {len(messages_data)} message entries")
    
    # Display summary statistics
    print("\nMessage Type Distribution:")
    type_counts = {}
    for msg in messages_data:
        msg_type = msg['Type']
        type_counts[msg_type] = type_counts.get(msg_type, 0) + 1
    
    for msg_type, count in sorted(type_counts.items()):
        print(f"  {msg_type}: {count}")
    
    print("\nDate Range:")
    if messages_data:
        print(f"From: {messages_data[0]['Date & Time']}")
        print(f"To: {messages_data[-1]['Date & Time']}")
    
    # Display first few rows
    print("\nFirst 10 rows:")
    columns = ['Date & Time', 'Type', 'Communication_Category', 'Text', 'Sources', 'Targets', 'Event_Communication', 'Event_Monitoring']
    
    # Print header
    print(f"{'Date & Time':<20} {'Type':<25} {'Category':<12} {'Text':<40} {'Sources':<15} {'Targets':<15} {'Event_Communication':<25} {'Event_Monitoring':<20}")
    print("-" * 172)
    
    # Print first 10 rows
    for i, msg in enumerate(messages_data[:10]):
        text_preview = msg['Text'][:37] + "..." if len(msg['Text']) > 40 else msg['Text']
        print(f"{msg['Date & Time']:<20} {msg['Type']:<25} {msg['Communication_Category']:<12} {text_preview:<40} {msg['Sources']:<15} {msg['Targets']:<15} {msg['Event_Communication']:<25} {msg['Event_Monitoring']:<20}")
    
    # Save to CSV
    output_file = '../data/nadia_messages_analysis.csv'
    
    with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=columns)
        writer.writeheader()
        writer.writerows(messages_data)
    
    print(f"\nData saved to: {output_file}")
    
    return messages_data

if __name__ == "__main__":
    data = main()