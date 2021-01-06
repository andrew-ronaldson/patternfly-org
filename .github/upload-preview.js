const path = require('path');
const { Octokit } = require('@octokit/rest')
const octokit = new Octokit({ auth: process.env.GH_PR_TOKEN });
const surge = require('surge');
const publishFn = surge().publish();

// From github actions
const ghrepo = process.env.GITHUB_REPOSITORY || '';
const ghref = process.env.GITHUB_REF || '';

// From CircleCI
const owner = process.env.CIRCLE_PROJECT_USERNAME || ghrepo.split('/')[0]; // patternfly
const repo = process.env.CIRCLE_PROJECT_REPONAME || ghrepo.split('/')[1];
const prnum = process.env.CIRCLE_PR_NUMBER || (ghref.match(/pull\/(\d+)/) || [])[1];
// Can contain special characters but surge replaces them
const branch = process.env.CIRCLE_BRANCH || ghref.replace('refs/heads/', '');

const uploadFolder = process.argv[2];
const uploadName = process.argv[3] || uploadFolder;
if (!uploadFolder) {
  console.log('Usage: upload-preview uploadFolder');
  process.exit(1);
}

const uploadFolderName = path.basename(uploadFolder);
let uploadURL = `${repo}-${prnum ? `pr-${prnum}` : branch}`.replace(/[\/|\.]/g, '-');

uploadURL += `-${uploadName}`;
uploadURL += '.surge.sh';

publishFn({
  project: uploadFolder,
  p: uploadFolder,
  domain: uploadURL,
  d: uploadURL,
  e: 'https://surge.surge.sh',
  endpoint: 'https://surge.surge.sh'
});

function tryAddComment(comment, commentBody) {
  if (!commentBody.includes(comment)) {
    return comment;
  }
  return '';
}

if (prnum) {
  octokit.issues.listComments({
    owner,
    repo,
    issue_number: prnum
  })
    .then(res => res.data)
    .then(comments => {
      let commentBody = '';
      const existingComment = comments.find(comment => comment.user.login === 'patternfly-build');
      if (existingComment) {
        commentBody += existingComment.body.trim();
        commentBody += '\n';
      }

      if (uploadName === 'v3') {
        commentBody += tryAddComment(`PF3 preview: https://${uploadURL}/v3`, commentBody);
      }
      else if (uploadName === 'v4') {
        commentBody += tryAddComment(`PF4 preview: https://${uploadURL}/v4`, commentBody);
      }
      else if (uploadFolderName === 'coverage') {
        commentBody += tryAddComment(`A11y report: https://${uploadURL}`, commentBody);
      }

      if (existingComment) {
        octokit.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body: commentBody
        }).then(() => console.log('Updated comment!'));
      } else {
        octokit.issues.createComment({
          owner,
          repo,
          issue_number: prnum,
          body: commentBody
        }).then(() => console.log('Created comment!'));
      }
    });
}