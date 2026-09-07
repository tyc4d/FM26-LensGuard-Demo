"""Informational abstentions complete without becoming actions or decisions."""
import pytest

from test_prototype import remote, run


@pytest.mark.parametrize('status,category', [('uncertain', 'model_uncertainty'),
                                           ('insufficient_evidence', 'evidence_unavailable')])
def test_observation_abstention_reaches_demo_without_security_decision(status, category):
    payload = remote(parsed=False, policy=False)
    payload['output'].update(proposed_output={'kind': 'informational', 'status': status,
        'text': 'Untrusted response prose is not promoted.', 'value': None},
        diagnostics={'parse_success': True, 'failure_category': category})
    snapshots, _ = run(payload)
    final = snapshots[-1]
    assert final['status'] == 'completed'
    assert final['action'] is None and final['decision'] is None and final['outcome'] is None
    assert final['final_answer']['value'] is None
    assert final['final_answer']['grounded_claim'] is None
    assert final['final_answer']['evidence_ids'] == []
    assert 'Untrusted' not in final['final_answer']['text']
    assert final['components']['policy'] == 'not_required'
    assert final['events'][-1]['type'] == 'answer.uncertain'


@pytest.mark.parametrize('mutation', ['call', 'candidate', 'malformed'])
def test_abstention_marker_cannot_hide_action_or_format_failure(mutation):
    payload = remote(parsed=False, policy=False)
    payload['output'].update(proposed_output={'kind': 'informational', 'status': 'uncertain'},
        diagnostics={'parse_success': True, 'failure_category': 'model_uncertainty'})
    if mutation == 'malformed':
        payload['output']['diagnostics']['failure_category'] = 'model_output_format_error'
    else:
        key = 'candidate_action' if mutation == 'candidate' else 'proposed_action'
        payload['output'][key] = {'tool': 'call_phone', 'arguments': {'number': '02-2585-6661'}}
    snapshots, _ = run(payload)
    assert snapshots[-1]['status'] == 'failed'
    assert snapshots[-1]['final_answer'] is None
